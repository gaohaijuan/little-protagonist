'use strict';

function clamp(value, min, max, fallback) {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

// x/y are positions along the available travel, not pixel offsets: 0 reaches
// the first edge and 100 reaches the opposite edge at every zoom level.
function getCropRect(imageWidth, imageHeight, options, aspectRatio) {
  const ratio = aspectRatio === undefined ? 54 / 57 : aspectRatio;
  if (!Number.isFinite(imageWidth) || imageWidth <= 0 ||
      !Number.isFinite(imageHeight) || imageHeight <= 0 ||
      !Number.isFinite(ratio) || ratio <= 0) {
    throw new RangeError('图片尺寸和裁剪比例必须为正数。');
  }
  const source = options || {};
  const zoom = clamp(source.zoom === undefined ? 1 : source.zoom, 1, 3, 1);
  const positionX = clamp(source.x === undefined ? 50 : source.x, 0, 100, 50);
  const positionY = clamp(source.y === undefined ? 50 : source.y, 0, 100, 50);
  const baseWidth = Math.min(imageWidth, imageHeight * ratio);
  const width = baseWidth / zoom;
  const height = width / ratio;
  const availableX = Math.max(0, imageWidth - width);
  const availableY = Math.max(0, imageHeight - height);
  return {
    x: availableX * positionX / 100,
    y: availableY * positionY / 100,
    width,
    height
  };
}

module.exports = { getCropRect };
