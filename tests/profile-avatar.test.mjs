import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

const require = createRequire(import.meta.url);
const mini = 'wechat-miniprogram/miniprogram/';
const avatarModule = { exports: {} };
vm.runInNewContext(await readFile(mini + 'utils/profile-avatar.js', 'utf8'), { module: avatarModule });
const avatarHelper = avatarModule.exports;
const { isCustomAvatar, avatars } = require('../shared/avatars.cjs');
const { memoryDb } = require('./helpers/ai-memory-db.cjs');
const jpeg = '/9j/AA==', png = 'iVBORw0KGgoAAA==';
const custom = 'data:image/png;base64,' + png;
const previous = 'data:image/jpeg;base64,' + jpeg;
const tap = (dataset = {}) => ({ currentTarget: { dataset }, detail: {} });

test('avatar preparation scales a large photo proportionally until it fits the server contract', async () => {
  const attempts = [];
  const value = await avatarHelper.prepareAvatar({
    getImageInfo: async () => ({ width: 4000, height: 3000 }),
    compressImage: async options => { attempts.push(options); return { tempFilePath: attempts.length === 1 ? 'large' : 'small' }; },
    getFileSystemManager: () => ({ readFileSync: file => file === 'large' ? '/9j/' + 'A'.repeat(230000) : jpeg }),
  }, 'camera-original');
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].compressedWidth, 384);
  assert.equal(attempts[0].compressedHeight, 288);
  assert.equal(attempts[1].compressedWidth, 256);
  assert.equal(attempts[1].compressedHeight, 192);
  assert.equal(value, previous);
  assert.equal(isCustomAvatar(value), true);
});

test('avatar preparation preserves a supported PNG when device compression fails', async () => {
  const value = await avatarHelper.prepareAvatar({
    getImageInfo: async () => ({ width: 128, height: 128 }),
    compressImage: async () => { throw new Error('unsupported format'); },
    getFileSystemManager: () => ({ readFileSync: () => png }),
  }, 'temporary-name.jpg');
  assert.equal(value, custom, 'actual encoded format must win over the temporary filename extension');
  assert.equal(isCustomAvatar(value), true);
});

test('avatar preparation rejects oversized and unsupported files before profile submission', async () => {
  for (const [base64, expected] of [['/9j/' + 'A'.repeat(230000), /过大/], ['R0lGODlhAQABAIAAAP', /JPG、PNG 或 WebP/]]) {
    await assert.rejects(avatarHelper.prepareAvatar({
      getImageInfo: async () => ({}),
      compressImage: async () => { throw new Error('cannot compress'); },
      getFileSystemManager: () => ({ readFileSync: () => base64 }),
    }, 'source'), expected);
  }
});

function patchData(data, patch) {
  for (const [key, value] of Object.entries(patch)) {
    const parts = key.split('.');
    let target = data;
    for (const part of parts.slice(0, -1)) target = target[part] ||= {};
    target[parts.at(-1)] = value;
  }
}
const indexSource = await readFile(mini + 'pages/index/index.js', 'utf8');
function indexFixture(wxOverrides = {}) {
  let definition;
  const notices = [], calls = [];
  const wx = { showLoading() {}, hideLoading() {}, showToast() {}, setStorageSync() {}, ...wxOverrides };
  vm.runInNewContext(indexSource, {
    wx, Page: value => { definition = value; }, setTimeout, clearTimeout,
    require: name => name.endsWith('/profile-avatar') ? avatarHelper : name === './demo' ? { createDemoExperience: () => ({}) } : {},
  });
  const page = { ...definition, data: structuredClone(definition.data), setData(patch) { patchData(this.data, patch); } };
  Object.assign(page, { requireLogin: () => true, notify: value => notices.push(value), derive() {}, reloadTrips: async () => {},
    call: async (operation, input) => { calls.push({ operation, input }); return { account: { ...input, id: 'account-a' } }; },
  });
  page.data.account = { id: 'account-a', nickname: '原昵称', avatarId: '', avatarData: previous, profileComplete: true };
  page.openProfile(false);
  return { page, wx, notices, calls };
}

test('canceling avatar selection preserves the saved photo and does not send a profile mutation', async () => {
  const f = indexFixture({ chooseMedia: async () => { throw { errMsg: 'chooseMedia:fail cancel' }; } });
  await f.page.chooseCustomAvatar();
  assert.equal(f.page.data.modal.values.avatarData, previous);
  assert.equal(f.page.data.avatarChoosing, false);
  assert.equal(f.calls.length, 0);
  assert.equal(f.notices.length, 0);
});

test('a denied photo permission leaves the old avatar intact and explains how to retry', async () => {
  const f = indexFixture({ chooseMedia: async () => { throw { errMsg: 'chooseMedia:fail privacy permission denied' }; } });
  await f.page.chooseCustomAvatar();
  assert.equal(f.page.data.modal.values.avatarData, previous);
  assert.equal(f.calls.length, 0);
  assert.equal(f.page.data.avatarChoosing, false);
  assert.match(f.notices[0], /允许相册或相机权限/);
});

test('profile avatar choices keep the first two rows: upload plus the first seven default avatars', () => {
  const f = indexFixture();
  assert.deepEqual(Array.from(f.page.data.profileAvatars, avatar => avatar.id), ['avatar-01', 'avatar-02', 'avatar-03', 'avatar-04', 'avatar-05', 'avatar-06', 'avatar-07']);
  assert.equal(f.page.editorSnapshot().profileAvatars.length, 7);
  f.page.chooseAvatar(tap({ id: 'avatar-07' }));
  assert.equal(f.page.data.modal.values.avatarId, 'avatar-07');
  assert.equal(f.page.data.modal.values.avatarData, '', 'selecting a default must replace the previously selected upload');
});

test('a late avatar selection does not replace another form and double taps open the picker once', async () => {
  let complete, choices = 0;
  const f = indexFixture({
    chooseMedia: () => { choices++; return new Promise(resolve => { complete = resolve; }); },
    getImageInfo: async () => ({}), compressImage: async () => ({ tempFilePath: 'chosen' }),
    getFileSystemManager: () => ({ readFileSync: () => png }),
  });
  const choosing = f.page.chooseCustomAvatar();
  await f.page.chooseCustomAvatar();
  await f.page.submitModal();
  assert.equal(f.calls.length, 0, 'saving must wait for selection and compression to finish');
  f.page.data.modal = { type: 'profile', values: { nickname: '另一个草稿', avatarData: previous } };
  complete({ tempFiles: [{ tempFilePath: 'chosen' }] });
  await choosing;
  assert.equal(choices, 1);
  assert.equal(f.page.data.modal.values.avatarData, previous);
  assert.equal(f.page.data.avatarChoosing, false);
});

test('profile page forwards the upload tap, receives the selected photo, and saves it through the account API', async () => {
  const handlers = new Map(), pending = [];
  const channel = {
    on(name, callback) { const callbacks = handlers.get(name) || []; callbacks.push(callback); handlers.set(name, callbacks); },
    emit(name, value) { for (const callback of handlers.get(name) || []) pending.push(Promise.resolve(callback(value))); },
  };
  let pickOptions;
  const f = indexFixture({
    navigateTo: ({ success }) => success({ eventChannel: channel }),
    chooseMedia: async options => { pickOptions = options; return { tempFiles: [{ tempFilePath: 'selected' }] }; },
    getImageInfo: async () => ({ width: 120, height: 120 }), compressImage: async () => ({ tempFilePath: 'selected' }),
    getFileSystemManager: () => ({ readFileSync: () => png }),
  });
  let profileDefinition;
  vm.runInNewContext(await readFile(mini + 'pages/profile/index.js', 'utf8'), {
    wx: { getSystemInfoSync: () => ({}), getMenuButtonBoundingClientRect: () => ({ bottom: 64 }) },
    Page: value => { profileDefinition = value; },
    require: name => name.endsWith('/form-sheet') ? { installFormSheet() {}, disposeFormSheet() {}, formSheetMethods: {} }
      : name.endsWith('/interaction-motion') ? { installMotion() {}, disposeMotion() {} }
      : { buildProfileView: () => [] },
  });
  const profile = { ...profileDefinition, data: structuredClone(profileDefinition.data), getOpenerEventChannel: () => channel, setData(patch) { patchData(this.data, patch); } };
  profile.onLoad();
  f.page.openProfilePage();
  profile.command(tap({ method: 'editProfile' }));
  assert.equal(profile.data.modal.type, 'profile');
  assert.equal(profile.data.profileAvatars.length, 7);
  assert.equal(typeof profile.chooseCustomAvatar, 'function', 'foreground profile form must expose its upload handler');
  profile.chooseCustomAvatar(tap());
  while (pending.length) await Promise.all(pending.splice(0));
  assert.equal(pickOptions.count, 1);
  assert.ok(pickOptions.sourceType.includes('album'));
  assert.ok(pickOptions.sourceType.includes('camera'));
  assert.equal(profile.data.modal.values.avatarData, custom);
  assert.equal(profile.data.modal.values.avatarId, '');
  assert.equal(f.calls.length, 0, 'selection alone must not save');
  profile.submitModal(tap());
  while (pending.length) await Promise.all(pending.splice(0));
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].operation, 'updateAccountProfile');
  assert.equal(f.calls[0].input.avatarData, custom);
  assert.equal(profile.data.account.avatarSrc, custom);
  assert.equal(profile.data.modal, null);
});

test('the shared editor page forwards its upload tap to the originating page', async () => {
  let definition;
  const events = [];
  vm.runInNewContext(await readFile(mini + 'pages/editor/index.js', 'utf8'), { Page: value => { definition = value; } });
  const editor = { ...definition, channel: { emit: (name, value) => events.push({ name, value }) } };
  editor.chooseCustomAvatar(tap());
  assert.equal(events.length, 1);
  assert.equal(events[0].name, 'command');
  assert.equal(events[0].value.method, 'chooseCustomAvatar');
});

test('custom avatar account save updates linked travelers while preserving other members', async () => {
  const source = await readFile('cloudfunctions/suixing-api/index.js', 'utf8');
  const db = memoryDb({
    users: { a: { id: 'a', nickname: '旧昵称', avatarId: 'avatar-01' } },
    links: { l1: { accountId: 'a', tripId: 't1', memberId: 'm1' } },
    trips: { t1: { id: 't1', revision: 3, members: [{ id: 'm1', accountId: 'a', name: '旧昵称', avatarId: 'avatar-01' }, { id: 'm2', name: '同行人', avatarId: 'avatar-02' }], items: [{ id: 'i1', byMemberId: 'm1', by: '旧昵称' }] } },
  });
  const profileSource = source.slice(source.indexOf('const profileInput ='), source.indexOf('async function ensureAccount'));
  const updateSource = source.slice(source.indexOf('async function updateAccountProfile'), source.indexOf('const webLoginPayload'));
  const update = vm.runInNewContext(profileSource + '\n' + updateSource + '\nupdateAccountProfile', {
    db, collections: { users: db.collection('users'), members: db.collection('links') },
    avatarIds: avatars.map(value => value.id),
    fail: (status, message) => { throw Object.assign(new Error(message), { status }); },
    ensureAccount: async principal => db.inspect('users')[principal.accountId],
    loadTrip: async (transaction, id) => (await transaction.collection('trips').doc(id).get()).data[0],
  });
  const result = await update({ accountId: 'a' }, { nickname: '新昵称', avatarId: 'avatar-09', avatarData: custom });
  assert.equal(result.account.avatarData, custom);
  assert.equal(result.account.avatarId, '');
  const trip = db.inspect('trips').t1;
  assert.equal(trip.members[0].avatarData, custom);
  assert.equal(trip.members[0].avatarId, '');
  assert.equal(trip.members[1].avatarId, 'avatar-02');
  assert.equal(trip.items[0].by, '新昵称');
  assert.equal(trip.revision, 4);
});
