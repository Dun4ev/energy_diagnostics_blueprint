// Real product screenshots, with deterministic camera and pointer cues.
function standWrapText(text, x, y, width, lineHeight) {
  let line = '', nextY = y;
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) {
      ctx.fillText(line, x, nextY);
      nextY += lineHeight;
      line = word;
    } else line = next;
  }
  if (line) ctx.fillText(line, x, nextY);
}
function standEase(value) { const v = Math.max(0, Math.min(1, value)); return v * v * (3 - 2 * v); }
function standPointer(x, y, opacity) {
  ctx.save(); ctx.globalAlpha *= opacity; ctx.translate(x, y);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 40); ctx.lineTo(10, 30); ctx.lineTo(19, 49);
  ctx.lineTo(27, 45); ctx.lineTo(18, 26); ctx.lineTo(33, 26); ctx.closePath();
  ctx.lineWidth = 3; ctx.strokeStyle = '#17334d'; ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke(); ctx.restore();
}
function sceneStill(i) {
  const item = STEPS[i], sx = 397, sy = 148, sw = 1460, sh = 821.25;
  const local = Math.max(0, Math.min(8, TT - i * 8));
  const detail = Boolean(item.afterImg && local >= 4), phase = detail ? local - 4 : local;
  const imageName = detail ? item.afterImg : item.img;
  const focusBox = detail ? item.afterFocus : item.focus;
  ctx.fillStyle = '#f3f7fa'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#0b3556'; ctx.fillRect(0, 0, W, 88);
  ctx.fillStyle = '#ffffff'; ctx.font = '600 28px "Segoe UI", Arial, sans-serif';
  ctx.fillText('ЭнергоДиагностика · DEMO', 56, 55);
  ctx.fillStyle = '#d6e8f4'; ctx.font = '600 21px "Segoe UI", Arial, sans-serif';
  ctx.fillText('SIMULATION · УЧЕБНЫЕ ДАННЫЕ', 995, 54);
  const dataTime = item.img === '01-overview.png' ? '01.07.2026, 10:40' : '24.07.2026, 10:40';
  ctx.fillText(`Время данных: ${dataTime} МСК`, 1458, 54);
  ctx.fillStyle = '#0069b4'; ctx.font = '700 23px "Segoe UI", Arial, sans-serif';
  ctx.fillText(`${String(i + 1).padStart(2, '0')} / ${STEPS.length}`, 58, 170);
  ctx.fillStyle = '#17334d'; ctx.font = '700 48px "Segoe UI", Arial, sans-serif';
  standWrapText(item.title, 58, 245, 310, 58);
  ctx.fillStyle = '#52677a'; ctx.font = '400 29px "Segoe UI", Arial, sans-serif';
  standWrapText(item.body, 58, 450, 300, 43);
  ctx.fillStyle = '#52677a'; ctx.font = '600 18px "Segoe UI", Arial, sans-serif';
  standWrapText(item.mode, 58, 790, 300, 27);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(sx - 4, sy - 4, sw + 8, sh + 8);
  ctx.save(); ctx.beginPath(); ctx.rect(sx, sy, sw, sh); ctx.clip();
  const focus = focusBox || [500, 250, 600, 400], scale = sw / 1600;
  const fx = sx + (focus[0] + focus[2] / 2) * scale, fy = sy + (focus[1] + focus[3] / 2) * scale;
  const zoom = 1 + (focusBox ? 0.13 : 0.025) * standEase((phase - 0.8) / 3.6);
  ctx.translate(fx, fy); ctx.scale(zoom, zoom); ctx.translate(-fx, -fy);
  drawAsset(imageName, sx, sy, sw, sh, { fit: 'contain' });
  if (focusBox) {
    const [x, y, w, h] = focusBox;
    ctx.strokeStyle = '#0069b4'; ctx.lineWidth = 5 / zoom;
    ctx.globalAlpha = standEase((phase - 0.5) / 0.8);
    ctx.strokeRect(sx + x * scale, sy + y * scale, w * scale, h * scale);
    ctx.globalAlpha = 1;
    if (item.action) {
      const travel = standEase((phase - 0.7) / 1.8);
      const px = fx - 170 * (1 - travel), py = fy - 115 * (1 - travel);
      standPointer(px, py, standEase(phase / 0.5));
      const ring = standEase((phase - 2.5) / 0.25) * (1 - standEase((phase - 3.1) / 0.6));
      if (ring > 0) { ctx.beginPath(); ctx.arc(fx, fy, 12 + 22 * (1 - ring), 0, Math.PI * 2); ctx.strokeStyle = `rgba(0,105,180,${ring})`; ctx.lineWidth = 5 / zoom; ctx.stroke(); }
    }
  }
  ctx.restore();
  ctx.fillStyle = '#d6e2ec'; ctx.fillRect(58, 1030, W - 116, 4);
  ctx.fillStyle = '#0069b4'; ctx.fillRect(58, 1030, (W - 116) * (i + local / 8) / STEPS.length, 4);
}
