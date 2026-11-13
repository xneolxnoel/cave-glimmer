# -*- coding: utf-8 -*-
"""从 game.js 自动生成会话内预览单文件副本（fragment）。
用法：python tools/build_fragment.py
"""
import io, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'game.js')
OUT = r'C:\Users\LENOVO\.zcode\v2\visualizations\3228315dd88b31210c40c1e4c45a9f6f43004c2a52daf81641e8d6d29f991182\cave-glimmer-preview.html'

TEMPLATE_HEAD = '''<div id="cg-root">
  <div id="cg-stage">
    <canvas id="cg-canvas"></canvas>

    <div id="cg-hint">别着急 · 慢慢走向那盏光</div>

    <div id="cg-menu" class="cg-overlay cg-show">
      <div class="cg-panel">
        <div class="cg-title">洞窟微光</div>
        <div class="cg-subtitle">CAVE GLIMMER · 第一关 · 光在等你</div>
        <div class="cg-keys">
          <span>A / D 或 ← / →</span> 移动 <i></i>
          <span>W / ↑</span> 跳跃 <i></i>
          <span>空格</span> 攻击/蓄气 <i></i>
          <span>Shift</span> 闪冲 <i></i>
          <span>Q</span> 格挡 <i></i>
          <span>E</span> 气焰 <i></i>
          <span>R</span> 重来
        </div>
        <button id="cg-startBtn">开 始 探 索</button>
        <div class="cg-focus-tip">点击画面以启用键盘</div>
      </div>
    </div>

    <div id="cg-clear" class="cg-overlay">
      <div class="cg-panel">
        <div class="cg-title cg-title-small" id="cg-clearTitle">✦ 第一关 · 完成 ✦</div>
        <div class="cg-time" id="cg-timeText">走了 0.0 秒，抵达了光</div>
        <div class="cg-btnrow">
          <button id="cg-retryBtn">再 走 一 次</button>
          <button id="cg-nextBtn" class="cg-locked" disabled>第二关 · 敬请期待</button>
        </div>
      </div>
    </div>

    <div id="cg-over" class="cg-overlay">
      <div class="cg-panel">
        <div class="cg-title cg-title-small">火把熄灭了</div>
        <div class="cg-time" id="cg-overTime">水声吞没了微光</div>
        <div class="cg-btnrow">
          <button id="cg-retryBtn2">再 试 一 次</button>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  #cg-root { width: 100%; }
  #cg-root, #cg-root * { margin: 0; padding: 0; box-sizing: border-box; }
  #cg-stage {
    position: relative; width: 100%; aspect-ratio: 16 / 9;
    overflow: hidden; background: #060302;
    font-family: "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif;
    box-shadow: 0 0 60px rgba(0,0,0,.55);
  }
  #cg-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }

  #cg-root .cg-overlay {
    position: absolute; inset: 0; z-index: 10;
    display: flex; align-items: center; justify-content: center;
    background: radial-gradient(ellipse at center, rgba(20,12,6,.34) 0%, rgba(10,6,3,.78) 100%);
    opacity: 0; pointer-events: none; transition: opacity .6s ease;
  }
  #cg-root .cg-overlay.cg-show { opacity: 1; pointer-events: auto; }
  #cg-root .cg-panel { text-align: center; padding: 24px 32px; }

  #cg-root .cg-title {
    font-size: 44px; font-weight: 300; letter-spacing: 16px; text-indent: 16px;
    color: #e8d5a8;
    text-shadow: 0 0 30px rgba(255,200,110,.4), 0 0 90px rgba(255,170,60,.18);
    margin-bottom: 10px;
  }
  #cg-root .cg-title-small { font-size: 30px; letter-spacing: 9px; text-indent: 9px; }
  #cg-root .cg-subtitle { font-size: 13px; letter-spacing: 5px; color: #a89a86; margin-bottom: 22px; }
  #cg-root .cg-keys { font-size: 12px; color: #97897a; letter-spacing: 2px; margin-bottom: 24px; }
  #cg-root .cg-keys span {
    display: inline-block; padding: 2px 8px; margin: 0 3px;
    border: 1px solid rgba(200,180,150,.3); border-radius: 5px;
    color: #c4b5a0; font-size: 11px; background: rgba(255,255,255,.03);
  }
  #cg-root .cg-keys i { display: inline-block; width: 20px; }
  #cg-root .cg-focus-tip { margin-top: 14px; font-size: 11px; letter-spacing: 3px; color: rgba(180,160,135,.55); }

  #cg-root button {
    font-family: inherit; cursor: pointer;
    padding: 11px 36px; font-size: 15px; letter-spacing: 7px; text-indent: 7px;
    color: #140f06; background: linear-gradient(180deg, #f0d79a, #d9b465);
    border: none; border-radius: 4px;
    box-shadow: 0 0 24px rgba(230,190,110,.25), inset 0 1px 0 rgba(255,255,255,.4);
    transition: all .2s;
  }
  #cg-root button:hover { box-shadow: 0 0 38px rgba(240,200,120,.45), inset 0 1px 0 rgba(255,255,255,.4); transform: translateY(-1px); }
  #cg-root button:active { transform: translateY(1px); }
  #cg-root button.cg-locked {
    background: none; color: #7a6f60; border: 1px solid rgba(150,135,110,.35);
    box-shadow: none; cursor: default; letter-spacing: 4px;
  }
  #cg-root button.cg-locked:hover { transform: none; box-shadow: none; background: rgba(255,255,255,.02); }
  #cg-root .cg-btnrow { display: flex; gap: 14px; justify-content: center; }
  #cg-root .cg-time { font-size: 13px; letter-spacing: 3px; color: #ab9068; margin-bottom: 24px; }

  #cg-root #cg-hint {
    position: absolute; top: 6%; left: 50%; transform: translateX(-50%);
    z-index: 5; font-size: 14px; letter-spacing: 4px;
    color: rgba(240,220,180,.85); text-shadow: 0 0 14px rgba(255,200,120,.35);
    opacity: 0; transition: opacity 1.2s ease; pointer-events: none; white-space: nowrap;
  }
  #cg-root #cg-hint.cg-show { opacity: 1; }
</style>

<script>
'''

TEMPLATE_TAIL = '''
</script>
'''

OLD_FIT = '''/* ============================================================
   自适应窗口
   ============================================================ */
function fit() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const scale = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
  const cssW = Math.round(VIEW_W * scale), cssH = Math.round(VIEW_H * scale);
  canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
  canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
  k = canvas.width / VIEW_W;
  sk = Math.min(k, 1.5);
  renderScene();
}
window.addEventListener('resize', fit);
fit();'''

NEW_FIT = '''function fit() {
  const rect = stage.getBoundingClientRect();
  if (rect.width < 10) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  k = canvas.width / VIEW_W;
  sk = Math.min(k, 1.5);
  renderScene();
}
if (window.ResizeObserver) new ResizeObserver(fit).observe(stage);
window.addEventListener('resize', fit);
fit();'''

def main():
    with io.open(SRC, 'r', encoding='utf-8') as f:
        js = f.read()

    # 元素 id 加前缀（game 特殊：对应 cg-canvas）
    for rid in ['game', 'hint', 'muteBtn', 'menu', 'clear', 'timeText', 'clearTitle',
                'over', 'overTime', 'startBtn', 'retryBtn', 'retryBtn2', 'nextBtn']:
        new_id = 'cg-canvas' if rid == 'game' else 'cg-%s' % rid
        js = js.replace("getElementById('%s')" % rid, "getElementById('%s')" % new_id)

    # overlay 类名
    js = js.replace("classList.add('show')", "classList.add('cg-show')")
    js = js.replace("classList.remove('show')", "classList.remove('cg-show')")

    # 注入 stage 引用
    js = js.replace(
        "const canvas = document.getElementById('cg-canvas');",
        "const stage = document.getElementById('cg-stage');\nconst canvas = document.getElementById('cg-canvas');")

    # 自适应块替换为容器尺寸版
    # game.js 中的注释块可能是多行形式，做宽松匹配
    start = js.find('function fit() {')
    if start == -1:
        raise SystemExit('fit() not found')
    end = js.find('fit();', start)
    if end == -1:
        raise SystemExit('fit() call not found')
    end += len('fit();')
    js = js[:start] + NEW_FIT + js[end:]

    # 包 IIFE
    js = '(function () {\n' + js + '\n})();'

    out = TEMPLATE_HEAD + js + TEMPLATE_TAIL
    with io.open(OUT, 'w', encoding='utf-8') as f:
        f.write(out)
    print('written', OUT, len(out))

if __name__ == '__main__':
    main()
