window.SOS = window.SOS || {};
(function (S) {
  'use strict';

  var D = Math.PI / 180;
  var MAX_SAFE_EDGE = 16384;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function imgToAssetLocal(a, ix, iy) {
    var r = (a.rotationDeg || 0) * D, c = Math.cos(r), s = Math.sin(r);
    var dx = ix - a.x, dy = iy - a.y;
    var lx = dx * c + dy * s;
    var ly = -dx * s + dy * c;
    if (a.flipX) lx = -lx;
    if (a.flipY) ly = -ly;
    return { x: lx, y: ly };
  }

  function assetLocalToImg(a, lx, ly) {
    var x = a.flipX ? -lx : lx;
    var y = a.flipY ? -ly : ly;
    var r = (a.rotationDeg || 0) * D, c = Math.cos(r), s = Math.sin(r);
    return { x: a.x + x * c - y * s, y: a.y + x * s + y * c };
  }

  // Sample exact RGB hex color from Base Satellite or composed canvas at natural pixel (ix, iy)
  function sampleColorAt(baseImg, ix, iy) {
    if (!baseImg || !baseImg.naturalWidth) return '#c5a267';
    var x = clamp(Math.round(ix), 0, baseImg.naturalWidth - 1);
    var y = clamp(Math.round(iy), 0, baseImg.naturalHeight - 1);
    var c = document.createElement('canvas');
    c.width = 1; c.height = 1;
    var g = c.getContext('2d');
    g.drawImage(baseImg, x, y, 1, 1, 0, 0, 1, 1);
    var d = g.getImageData(0, 0, 1, 1).data;
    c.width = 0; c.height = 0;
    return '#' + [d[0], d[1], d[2]].map(function (v) {
      var h = v.toString(16);
      return h.length < 2 ? '0' + h : h;
    }).join('');
  }

  // Crop Selected Asset using a polygon (in Base Image coordinates) -> keeps ONLY the cropped area
  function cropSelectedAssetByPolygon(asset, assetImg, polyImgPts, featherPx, cb) {
    if (!asset || !assetImg || !polyImgPts || polyImgPts.length < 3) {
      return cb(new Error('Select an asset and draw at least 3 crop points on it.'));
    }
    try {
      var sx = assetImg.naturalWidth / Math.max(1, asset.wPx);
      var sy = assetImg.naturalHeight / Math.max(1, asset.hPx);
      var localPoly = polyImgPts.map(function (pt) {
        var loc = imgToAssetLocal(asset, pt.x, pt.y);
        return {
          x: (loc.x + asset.wPx / 2) * sx,
          y: (loc.y + asset.hPx / 2) * sy
        };
      });

      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      localPoly.forEach(function (p) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      });

      var fPx = clamp(+featherPx || 0, 0, 12);
      var pad = Math.ceil(fPx * 2) + 2;
      var x0 = Math.max(0, Math.floor(minX - pad));
      var y0 = Math.max(0, Math.floor(minY - pad));
      var x1 = Math.min(assetImg.naturalWidth, Math.ceil(maxX + pad));
      var y1 = Math.min(assetImg.naturalHeight, Math.ceil(maxY + pad));
      var bw = x1 - x0, bh = y1 - y0;
      if (bw < 4 || bh < 4) return cb(new Error('Crop selection is outside or too small on the selected asset.'));

      var outCv = document.createElement('canvas');
      outCv.width = bw; outCv.height = bh;
      var octx = outCv.getContext('2d');
      octx.drawImage(assetImg, x0, y0, bw, bh, 0, 0, bw, bh);

      var maskCv = document.createElement('canvas');
      maskCv.width = bw; maskCv.height = bh;
      var mctx = maskCv.getContext('2d');
      mctx.beginPath();
      localPoly.forEach(function (p, i) {
        var lx = p.x - x0, ly = p.y - y0;
        if (i === 0) mctx.moveTo(lx, ly); else mctx.lineTo(lx, ly);
      });
      mctx.closePath();
      if (fPx > 0 && 'filter' in mctx) mctx.filter = 'blur(' + fPx + 'px)';
      mctx.fillStyle = '#ffffff';
      mctx.fill();
      mctx.filter = 'none';

      octx.globalCompositeOperation = 'destination-in';
      octx.drawImage(maskCv, 0, 0);
      octx.globalCompositeOperation = 'source-over';

      var dataUrl = outCv.toDataURL('image/png');
      outCv.width = 0; outCv.height = 0;
      maskCv.width = 0; maskCv.height = 0;

      // Compute new center in image space so cropped stadium stays pinned in exact position
      var natCenterX = x0 + bw / 2;
      var natCenterY = y0 + bh / 2;
      var localCenterX = natCenterX / sx - asset.wPx / 2;
      var localCenterY = natCenterY / sy - asset.hPx / 2;
      var newImgCenter = assetLocalToImg(asset, localCenterX, localCenterY);

      cb(null, {
        dataUrl: dataUrl,
        naturalW: bw,
        naturalH: bh,
        wPx: +(bw / sx).toFixed(2),
        hPx: +(bh / sy).toFixed(2),
        x: +newImgCenter.x.toFixed(2),
        y: +newImgCenter.y.toFixed(2)
      });
    } catch (e) {
      cb(e);
    }
  }

  // Erase a polygon hole from Selected Asset (Lasso Delete inside any PNG / stadium layer)
  function erasePolygonFromAsset(asset, assetImg, polyImgPts, featherPx, cb) {
    if (!asset || !assetImg || !polyImgPts || polyImgPts.length < 3) {
      return cb(new Error('Select an asset and draw at least 3 points to erase.'));
    }
    try {
      var sx = assetImg.naturalWidth / Math.max(1, asset.wPx);
      var sy = assetImg.naturalHeight / Math.max(1, asset.hPx);
      var localPoly = polyImgPts.map(function (pt) {
        var loc = imgToAssetLocal(asset, pt.x, pt.y);
        return {
          x: (loc.x + asset.wPx / 2) * sx,
          y: (loc.y + asset.hPx / 2) * sy
        };
      });

      var cw = assetImg.naturalWidth, ch = assetImg.naturalHeight;
      var outCv = document.createElement('canvas');
      outCv.width = cw; outCv.height = ch;
      var octx = outCv.getContext('2d');
      octx.drawImage(assetImg, 0, 0);

      var maskCv = document.createElement('canvas');
      maskCv.width = cw; maskCv.height = ch;
      var mctx = maskCv.getContext('2d');
      mctx.beginPath();
      localPoly.forEach(function (p, i) {
        if (i === 0) mctx.moveTo(p.x, p.y); else mctx.lineTo(p.x, p.y);
      });
      mctx.closePath();
      var fPx = clamp(+featherPx || 0, 0, 12);
      if (fPx > 0 && 'filter' in mctx) mctx.filter = 'blur(' + fPx + 'px)';
      mctx.fillStyle = '#ffffff';
      mctx.fill();
      mctx.filter = 'none';

      octx.globalCompositeOperation = 'destination-out';
      octx.drawImage(maskCv, 0, 0);
      octx.globalCompositeOperation = 'source-over';

      var dataUrl = outCv.toDataURL('image/png');
      outCv.width = 0; outCv.height = 0;
      maskCv.width = 0; maskCv.height = 0;
      cb(null, dataUrl);
    } catch (e) {
      cb(e);
    }
  }

  // Magic Wand / Chroma Background Removal on Selected Asset at clicked image point
  function magicWandRemoveColor(asset, assetImg, clickImgPt, tolerance, contiguous, cb) {
    if (!asset || !assetImg) return cb(new Error('Select an asset first.'));
    try {
      var sx = assetImg.naturalWidth / Math.max(1, asset.wPx);
      var sy = assetImg.naturalHeight / Math.max(1, asset.hPx);
      var loc = imgToAssetLocal(asset, clickImgPt.x, clickImgPt.y);
      var tx = Math.round((loc.x + asset.wPx / 2) * sx);
      var ty = Math.round((loc.y + asset.hPx / 2) * sy);
      var cw = assetImg.naturalWidth, ch = assetImg.naturalHeight;
      if (tx < 0 || ty < 0 || tx >= cw || ty >= ch) {
        return cb(new Error('Click directly on the unwanted background color inside the selected asset.'));
      }

      var c = document.createElement('canvas');
      c.width = cw; c.height = ch;
      var g = c.getContext('2d');
      g.drawImage(assetImg, 0, 0);
      var imgData = g.getImageData(0, 0, cw, ch);
      var d = imgData.data;

      var idx0 = (ty * cw + tx) * 4;
      var r0 = d[idx0], g0 = d[idx0 + 1], b0 = d[idx0 + 2], a0 = d[idx0 + 3];
      if (a0 === 0) { c.width = 0; c.height = 0; return cb(new Error('Clicked pixel is already transparent.')); }

      var tol = clamp(+tolerance || 28, 1, 180);
      var tolSq = tol * tol * 3;
      var softSq = (tol + 12) * (tol + 12) * 3;

      function distSq(i) {
        var dr = d[i] - r0, dg = d[i + 1] - g0, db = d[i + 2] - b0;
        return dr * dr + dg * dg + db * db;
      }

      if (contiguous) {
        var vis = new Uint8Array(cw * ch);
        var stack = [ty * cw + tx];
        vis[ty * cw + tx] = 1;
        while (stack.length) {
          var p = stack.pop();
          var pi = p * 4;
          var ds = distSq(pi);
          if (ds <= tolSq) {
            d[pi + 3] = 0;
            var px = p % cw, py = (p - px) / cw;
            if (px > 0 && !vis[p - 1]) { vis[p - 1] = 1; stack.push(p - 1); }
            if (px + 1 < cw && !vis[p + 1]) { vis[p + 1] = 1; stack.push(p + 1); }
            if (py > 0 && !vis[p - cw]) { vis[p - cw] = 1; stack.push(p - cw); }
            if (py + 1 < ch && !vis[p + cw]) { vis[p + cw] = 1; stack.push(p + cw); }
          } else if (ds <= softSq) {
            var factor = (ds - tolSq) / Math.max(1, softSq - tolSq);
            d[pi + 3] = Math.round(d[pi + 3] * factor);
          }
        }
      } else {
        for (var j = 0; j < d.length; j += 4) {
          if (d[j + 3] === 0) continue;
          var ds2 = distSq(j);
          if (ds2 <= tolSq) d[j + 3] = 0;
          else if (ds2 <= softSq) {
            var f2 = (ds2 - tolSq) / Math.max(1, softSq - tolSq);
            d[j + 3] = Math.round(d[j + 3] * f2);
          }
        }
      }

      g.putImageData(imgData, 0, 0);
      var url = c.toDataURL('image/png');
      c.width = 0; c.height = 0;
      cb(null, url);
    } catch (e) {
      cb(e);
    }
  }

  // Crop entire Base Satellite Canvas to a rectangle (x0, y0, x1, y1 in Base Image pixels)
  function cropBaseCanvasRect(baseImg, rect, cb) {
    if (!baseImg || !baseImg.naturalWidth) return cb(new Error('No base satellite image loaded.'));
    var iw = baseImg.naturalWidth, ih = baseImg.naturalHeight;
    var x0 = clamp(Math.floor(Math.min(rect.x0, rect.x1)), 0, iw - 1);
    var y0 = clamp(Math.floor(Math.min(rect.y0, rect.y1)), 0, ih - 1);
    var x1 = clamp(Math.ceil(Math.max(rect.x0, rect.x1)), x0 + 16, iw);
    var y1 = clamp(Math.ceil(Math.max(rect.y0, rect.y1)), y0 + 16, ih);
    var cw = x1 - x0, ch = y1 - y0;
    if (cw > MAX_SAFE_EDGE || ch > MAX_SAFE_EDGE) return cb(new Error('Cropped size exceeds browser edge limit.'));
    try {
      var c = document.createElement('canvas');
      c.width = cw; c.height = ch;
      var g = c.getContext('2d');
      g.drawImage(baseImg, x0, y0, cw, ch, 0, 0, cw, ch);
      var url = c.toDataURL('image/png');
      c.width = 0; c.height = 0;
      cb(null, { dataUrl: url, x0: x0, y0: y0, width: cw, height: ch });
    } catch (e) {
      cb(e);
    }
  }

  S.SatPhotoTools = {
    sampleColorAt: sampleColorAt,
    cropSelectedAssetByPolygon: cropSelectedAssetByPolygon,
    erasePolygonFromAsset: erasePolygonFromAsset,
    magicWandRemoveColor: magicWandRemoveColor,
    cropBaseCanvasRect: cropBaseCanvasRect
  };
})(window.SOS);
