const MAX_AVATAR_LENGTH = 220000;

function avatarData(wx, path) {
  const base64 = wx.getFileSystemManager().readFileSync(path, 'base64');
  const type = base64.startsWith('/9j/') ? 'jpeg' : base64.startsWith('iVBOR') ? 'png' : base64.startsWith('UklGR') ? 'webp' : '';
  if (!type) throw new Error('请选择 JPG、PNG 或 WebP 照片');
  const data = 'data:image/' + type + ';base64,' + base64;
  return data.length <= MAX_AVATAR_LENGTH ? data : null;
}

async function prepareAvatar(wx, path) {
  let info;
  try { info = await wx.getImageInfo({ src: path }); } catch {}
  for (const [edge, quality] of [[384, 80], [256, 60], [160, 40]]) {
    try {
      const ratio = info?.width && info?.height ? Math.min(1, edge / Math.max(info.width, info.height)) : null;
      const compressed = await wx.compressImage({ src: path, quality,
        ...(ratio ? { compressedWidth: Math.max(1, Math.round(info.width * ratio)), compressedHeight: Math.max(1, Math.round(info.height * ratio)) } : {}),
      });
      const data = avatarData(wx, compressed.tempFilePath || path);
      if (data) return data;
    } catch { /* Some devices cannot compress PNG/WebP; try the original below. */ }
  }
  const data = avatarData(wx, path);
  if (!data) throw new Error('照片过大，请裁剪后重新选择');
  return data;
}

async function chooseAvatarImage(wx) {
  const media = await wx.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['album', 'camera'], sizeType: ['compressed'] });
  const path = media.tempFiles?.[0]?.tempFilePath;
  return path ? prepareAvatar(wx, path) : null;
}

module.exports = { prepareAvatar, chooseAvatarImage, MAX_AVATAR_LENGTH };
