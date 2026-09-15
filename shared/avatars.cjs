const avatars = [
  ["avatar-01", "羊驼", "avatar-01-alpaca.png"],
  ["avatar-02", "公鸡", "avatar-02-rooster.png"],
  ["avatar-03", "老鼠", "avatar-03-mouse.png"],
  ["avatar-04", "鳄鱼", "avatar-04-crocodile.png"],
  ["avatar-05", "大象", "avatar-05-elephant.png"],
  ["avatar-06", "水豚", "avatar-06-capybara.png"],
  ["avatar-07", "猫", "avatar-07-cat.png"],
  ["avatar-08", "狗", "avatar-08-dog.png"],
  ["avatar-09", "兔子", "avatar-09-rabbit.png"],
  ["avatar-10", "熊猫", "avatar-10-panda.png"],
  ["avatar-11", "狐狸", "avatar-11-fox.png"],
  ["avatar-12", "熊", "avatar-12-bear.png"],
  ["avatar-13", "企鹅", "avatar-13-penguin.png"],
  ["avatar-14", "海豹", "avatar-14-seal.png"],
  ["avatar-15", "浣熊", "avatar-15-raccoon.png"],
  ["avatar-16", "奶牛", "avatar-16-cow.png"],
].map(([id, name, file]) => ({ id, name, src: `/avatars/${file}` }));

const avatarIds = avatars.map((entry) => entry.id);
const isAvatarId = (value) => avatarIds.includes(value);
const customAvatarPattern = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const isCustomAvatar = (value) =>
  typeof value === "string" && value.length <= 220000 && customAvatarPattern.test(value);

function avatarInput(avatarId, avatarData) {
  if (isCustomAvatar(avatarData)) return { avatarId: "", avatarData };
  if (isAvatarId(avatarId)) return { avatarId, avatarData: "" };
  return null;
}

function normalizeMembers(trip) {
  const used = new Set();
  for (let index = 0; index < trip.members.length; index += 1) {
    const member = trip.members[index];
    if (isCustomAvatar(member.avatarData)) {
      member.avatarId = "";
      continue;
    }
    member.avatarData = "";
    if (isAvatarId(member.avatarId) && !used.has(member.avatarId)) {
      used.add(member.avatarId);
      continue;
    }
    const free = avatarIds.find((avatarId) => !used.has(avatarId));
    member.avatarId = free || avatarIds[index % avatarIds.length];
    used.add(member.avatarId);
  }
  for (const item of trip.items || []) {
    for (const [nameKey, idKey] of [["by", "byMemberId"], ["reviewBy", "reviewByMemberId"]]) {
      if (item[idKey] || !item[nameKey]) continue;
      const matches = trip.members.filter((member) => member.name === item[nameKey]);
      if (matches.length === 1) item[idKey] = matches[0].id;
    }
  }
  trip.schemaVersion = Math.max(Number(trip.schemaVersion) || 0, 4);
  return trip;
}

function avatarSelection(trip, memberId, avatarId) {
  if (!isAvatarId(avatarId)) return { valid: false, available: false, allowDuplicates: false };
  const others = trip.members.filter((member) => member.id !== memberId);
  const used = new Set(others.map((member) => member.avatarId).filter(isAvatarId));
  const allUsed = new Set(trip.members.map((member) => member.avatarId).filter(isAvatarId));
  const allowDuplicates = avatarIds.every((id) => allUsed.has(id));
  return { valid: true, available: allowDuplicates || !used.has(avatarId), allowDuplicates };
}

module.exports = { avatars, avatarIds, isAvatarId, isCustomAvatar, avatarInput, normalizeMembers, avatarSelection };
