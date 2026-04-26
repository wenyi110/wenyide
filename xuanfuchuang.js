$(errorCatched(async () => {

function coreLogic() {
    let pdoc, pwin;
    try {
        pdoc = (parent && parent.document) ? parent.document : document;
        pwin = (parent && parent.window)   ? parent.window   : window;
    } catch (e) {
        pdoc = document;
        pwin = window;
    }

    if (window.thEnvRafs) {
        cancelAnimationFrame(window.thEnvRafs.bg);
        clearInterval(window.thEnvRafs.presetTimer);
    }
    window.thEnvRafs = { bg: null, presetTimer: null };

    class BackgroundManager {
        constructor(pdoc, pwin, configKey, domIds) {
            this.pdoc = pdoc; this.pwin = pwin; this.configKey = configKey; this.domIds = domIds;
            this.DB_NAME = 'SillyTavern_BgStore'; this.STORE_NAME = 'bgImages';
            this.config = { bgDarkness: 0, opacityBubble: 0, opacityUI: 40, autoRotate: true, rotateInterval: 30, viewOffsetY: 0, bgScrollSpeed: 0, bgSizeMode: '100% auto' };
            this.cachedImages = []; this.currentBgIndex = -1; this.activeLayer = 1; this.rotateTimer = null;
            this._currentScrollSpeed = 0;   
            this.active = true; this.isAnimating = false; 
            this._loadConfig(); this._createDOMElements();
            let initY = Math.max(-1, Math.min(1, parseFloat(this.config.viewOffsetY) || 0));
            this.scrollPhase = Math.asin(initY) || 0; 
        }

        async initialize() {
            this.updateCSS(); await this._initGallery(); this._attachEventListeners();
            this._currentScrollSpeed = parseFloat(this.config.bgScrollSpeed) || 0;
            if (this._currentScrollSpeed !== 0) { this.isAnimating = true; this._panLoop(performance.now()); }
        }
        
        _panLoop(timestamp) {
            if (!this.active || this._currentScrollSpeed === 0) { this.isAnimating = false; this.lastTime = null; return; }
            if (!this.lastTime) this.lastTime = timestamp;
            const dt = timestamp - this.lastTime; this.lastTime = timestamp;
            if (dt > 100) { window.thEnvRafs.bg = requestAnimationFrame((ts) => this._panLoop(ts)); return; }
            this.scrollPhase += dt * this._currentScrollSpeed * 0.00004;
            if (this.scrollPhase >= Math.PI * 2) this.scrollPhase -= Math.PI * 2;
            if (this.scrollPhase <= -Math.PI * 2) this.scrollPhase += Math.PI * 2;
            let newY = Math.sin(this.scrollPhase); this.config.viewOffsetY = newY;
            let bgPosPercent = 50 - (newY * 50);
            this.pdoc.documentElement.style.setProperty('--th-view-offset-y', `${bgPosPercent.toFixed(5)}%`);
            if (timestamp - (this.lastUiUpdateTime || 0) > 250) {
                const roundedY = parseFloat(newY.toFixed(3)); const viewSlider = this.pdoc.getElementById('r-view');
                if (viewSlider) { viewSlider.value = roundedY; const viewNum = this.pdoc.getElementById('n-view'); if (viewNum && this.pdoc.activeElement !== viewNum) viewNum.value = roundedY; }
                this.lastUiUpdateTime = timestamp;
            }
            window.thEnvRafs.bg = requestAnimationFrame((ts) => this._panLoop(ts));
        }

        _loadConfig() { try { const saved = localStorage.getItem(this.configKey); if (saved) this.config = { ...this.config, ...JSON.parse(saved) }; if (Math.abs(this.config.viewOffsetY) > 10) this.config.viewOffsetY = 0; } catch (e) {} }
        _saveConfig() { localStorage.setItem(this.configKey, JSON.stringify(this.config)); }
        _createDOMElements() {
            this.bgLayer1 = this.pdoc.createElement('div'); this.bgLayer1.id = this.domIds.bgLayer1; this.bgLayer1.className = 'th-bg-layer'; this.pdoc.body.appendChild(this.bgLayer1);
            this.bgLayer2 = this.pdoc.createElement('div'); this.domIds.bgLayer2; this.bgLayer2.className = 'th-bg-layer'; this.pdoc.body.appendChild(this.bgLayer2);
            this.overlay = this.pdoc.createElement('div'); this.overlay.id = this.domIds.overlay; this.pdoc.body.appendChild(this.overlay);
        }
        
        updateCSS() {
            const rootStyle = this.pdoc.documentElement.style;
            const d = this.config.bgDarkness / 100, b = this.config.opacityBubble / 100, u = this.config.opacityUI / 100;
            rootStyle.setProperty('--th-overlay-dark', `rgba(0, 0, 0, ${d})`);
            if (b === 0) { rootStyle.setProperty('--th-bubble-bg', 'transparent'); rootStyle.setProperty('--th-bubble-blur', 'none'); rootStyle.setProperty('--th-bubble-shadow', 'none'); } 
            else { rootStyle.setProperty('--th-bubble-bg', `rgba(15, 15, 15, ${b})`); rootStyle.setProperty('--th-bubble-blur', `blur(${b * 15}px) saturate(${100 + b * 50}%)`); rootStyle.setProperty('--th-bubble-shadow', `inset 0 0 0 1px rgba(255, 255, 255, ${b * 0.15}), 0 8px 25px rgba(0, 0, 0, ${b * 0.6})`); }
            if (u === 0) { rootStyle.setProperty('--th-ui-bg', 'transparent'); rootStyle.setProperty('--th-safe-blur', 'none'); }
            else { rootStyle.setProperty('--th-ui-bg', `rgba(15, 15, 15, ${u})`); rootStyle.setProperty('--th-safe-blur', `blur(${u * 15}px) saturate(120%)`); }
            rootStyle.setProperty('--th-view-offset-y', `${50 - (parseFloat(this.config.viewOffsetY) * 50)}%`);
            rootStyle.setProperty('--th-bg-size', this.config.bgSizeMode || '100% auto');
            this._saveConfig();
        }

        _bindSlider(sliderId, prop, valueDisplayId) {
            const el = this.pdoc.getElementById(sliderId); const valEl = this.pdoc.getElementById(valueDisplayId);
            if(!el) return; el.value = this.config[prop]; valEl.innerText = this.config[prop];
            el.addEventListener('input', e => { this.config[prop] = e.target.value; valEl.innerText = e.target.value; this.updateCSS(); });
        }

        _attachEventListeners() {
            this._bindSlider('r-dark', 'bgDarkness', 'v-dark'); this._bindSlider('r-bub', 'opacityBubble', 'v-bub'); this._bindSlider('r-ui', 'opacityUI', 'v-ui');
            const viewSlider = this.pdoc.getElementById('r-view'); const viewNum = this.pdoc.getElementById('n-view');
            if (viewSlider && viewNum) {
                viewSlider.value = viewNum.value = parseFloat(this.config.viewOffsetY) || 0;
                const updateView = (val) => { let v = Math.max(-1, Math.min(1, parseFloat(val) || 0)); this.config.viewOffsetY = v; this.scrollPhase = Math.asin(v); viewSlider.value = viewNum.value = v; this.updateCSS(); };
                viewSlider.addEventListener('input', e => updateView(e.target.value)); viewNum.addEventListener('input', e => updateView(e.target.value));
            }
            const speedSlider = this.pdoc.getElementById('r-scroll'); const speedNum = this.pdoc.getElementById('scroll-speed-num');
            if (speedSlider && speedNum) {
                speedSlider.value = speedNum.value = this.config.bgScrollSpeed;
                const updateSpeed = (val) => { let v = Math.min(10, Math.max(-10, parseFloat(val) || 0)); this.config.bgScrollSpeed = this._currentScrollSpeed = v; speedSlider.value = speedNum.value = v; if (v !== 0 && !this.isAnimating) { this.isAnimating = true; this.lastTime = performance.now(); this._panLoop(this.lastTime); } this.updateCSS(); };
                speedSlider.addEventListener('input', (e) => updateSpeed(e.target.value)); speedNum.addEventListener('input', (e) => updateSpeed(e.target.value));
            }
            this.pdoc.getElementById('bgSizeMode').addEventListener('change', (e) => { this.config.bgSizeMode = e.target.value; this.updateCSS(); });
            this.pdoc.getElementById('autoRotate').onchange = (e) => { this.config.autoRotate = e.target.checked; this._updateSlideshowState(); this._saveConfig(); };
            this.pdoc.getElementById('rotateInterval').onchange = (e) => { this.config.rotateInterval = Math.max(3, parseInt(e.target.value) || 30); e.target.value = this.config.rotateInterval; this._updateSlideshowState(); this._saveConfig(); };
            this.pdoc.getElementById('btn-open-gallery').onclick = () => this._openGallery();
            this.pdoc.getElementById('btn-close-gallery').onclick = () => this._closeGallery();
            this.pdoc.getElementById('th-gallery-grid').onclick = (e) => this._handleGalleryClick(e);
            this.pdoc.getElementById('btn-clear-db').onclick = async () => { if(confirm('确定清空吗？')) { await this._clearDB(); this.cachedImages = []; this._initGallery(); } };
            this.pdoc.getElementById('btn-trigger-upload').onclick = () => this.pdoc.getElementById('bgUploader').click();
            this.pdoc.getElementById('bgUploader').onchange = (e) => this._handleUpload(e);
            this.pdoc.getElementById('btn-next-bg').onclick = () => { if(this.cachedImages.length > 1) this.showNextBackground(); };
        }

        _initDB() { return new Promise((resolve, reject) => { const req = this.pwin.indexedDB.open(this.DB_NAME, 1); req.onupgradeneeded = e => e.target.result.createObjectStore(this.STORE_NAME, { keyPath: 'id' }); req.onsuccess = e => resolve(e.target.result); req.onerror = e => reject(e); }); }
        async _loadImagesFromDB() { try { const db = await this._initDB(); const tx = db.transaction(this.STORE_NAME, 'readonly'); const req = tx.objectStore(this.STORE_NAME).getAll(); return new Promise(resolve => { req.onsuccess = e => resolve(e.target.result.map(x => x.data)); req.onerror = () => resolve([]); }); } catch(e) { return []; } }
        async _saveImagesToDB(arr) { const db = await this._initDB(); const tx = db.transaction(this.STORE_NAME, 'readwrite'); const store = tx.objectStore(this.STORE_NAME); store.clear(); arr.forEach((data, i) => store.put({ id: i, data })); return new Promise(resolve => tx.oncomplete = resolve); }
        async _clearDB() { const db = await this._initDB(); const tx = db.transaction(this.STORE_NAME, 'readwrite'); tx.objectStore(this.STORE_NAME).clear(); return new Promise(resolve => tx.oncomplete = resolve); }

        showNextBackground(forceIndex = null) {
            if (this.cachedImages.length === 0) return;
            this.currentBgIndex = forceIndex !== null ? forceIndex : (this.currentBgIndex + 1) % this.cachedImages.length;
            const nextB64 = this.cachedImages[this.currentBgIndex];
            if (this.activeLayer === 1) { this.bgLayer2.style.backgroundImage = `url(${nextB64})`; this.bgLayer2.style.opacity = 1; this.bgLayer1.style.opacity = 0; this.activeLayer = 2; } 
            else { this.bgLayer1.style.backgroundImage = `url(${nextB64})`; this.bgLayer1.style.opacity = 1; this.bgLayer2.style.opacity = 0; this.activeLayer = 1; }
        }

        _updateSlideshowState() {
            if (this.rotateTimer) clearInterval(this.rotateTimer);
            if (this.config.autoRotate && this.cachedImages.length > 1) { this.rotateTimer = setInterval(() => this.showNextBackground(), Math.max(this.config.rotateInterval * 1000, 3000)); }
        }

        async _initGallery() {
            this.cachedImages = await this._loadImagesFromDB();
            const statusEl = this.pdoc.getElementById('bg-status');
            if (this.cachedImages.length > 0) {
                statusEl.innerText = `已装载 ${this.cachedImages.length} 张`; statusEl.style.color = '#D6CBB4';
                this.pdoc.body.classList.add('th-custom-bg-active'); this.showNextBackground(0); this._updateSlideshowState();
            } else {
                statusEl.innerText = '原生生效中'; statusEl.style.color = '#aaa';
                this.pdoc.body.classList.remove('th-custom-bg-active'); this.bgLayer1.style.opacity = 0; this.bgLayer2.style.opacity = 0;
                if (this.rotateTimer) clearInterval(this.rotateTimer);
            }
        }
        
        _renderGalleryGrid() {
            const grid = this.pdoc.getElementById('th-gallery-grid');
            this.pdoc.getElementById('th-g-count').innerText = `(共 ${this.cachedImages.length} 张)`;
            if (this.cachedImages.length === 0) { grid.innerHTML = `<div style="grid-column: 1 / -1; text-align:center; color:#D6CBB4; padding:50px;">暂无自定义图片</div>`; return; }
            grid.innerHTML = this.cachedImages.map((imgBase64, idx) => `<div class="th-g-item"><img class="th-g-img" src="${imgBase64}" loading="lazy"><div class="th-g-mask"><button class="th-g-btn apply" data-idx="${idx}">✅ 设为背景</button><button class="th-g-btn del" data-idx="${idx}">🗑️ 删除</button></div></div>`).join('');
        }

        _openGallery() { this._renderGalleryGrid(); const galleryOverlay = this.pdoc.getElementById('th-gallery-overlay'); galleryOverlay.style.display = 'flex'; void galleryOverlay.offsetWidth; galleryOverlay.style.opacity = '1'; }
        _closeGallery() { const galleryOverlay = this.pdoc.getElementById('th-gallery-overlay'); galleryOverlay.style.opacity = '0'; setTimeout(() => galleryOverlay.style.display = 'none', 300); }

        async _handleGalleryClick(e) {
            const btn = e.target; if (!btn.classList.contains('th-g-btn')) return;
            const idx = parseInt(btn.getAttribute('data-idx'));
            if (btn.classList.contains('apply')) { this.showNextBackground(idx); this._closeGallery(); } 
            else if (btn.classList.contains('del')) { if (confirm('确定要删除吗？')) { this.cachedImages.splice(idx, 1); await this._saveImagesToDB(this.cachedImages); await this._initGallery(); this._renderGalleryGrid(); } }
        }
        
        async _handleUpload(e) {
            const files = Array.from(e.target.files); if (files.length === 0) return;
            const btn = this.pdoc.getElementById('btn-trigger-upload'); const originalText = btn.innerText;
            btn.innerText = `⏳ 存入中...`; btn.style.pointerEvents = 'none';
            let base64Arr = [...this.cachedImages];
            for (const file of files) { const base64 = await new Promise(resolve => { const reader = new FileReader(); reader.onload = ev => resolve(ev.target.result); reader.readAsDataURL(file); }); base64Arr.push(base64); }
            await this._saveImagesToDB(base64Arr); e.target.value = ''; btn.innerText = originalText; btn.style.pointerEvents = 'auto'; await this._initGallery();
        }

        destroy() { this.active = false; if (this.rotateTimer) clearInterval(this.rotateTimer); this.bgLayer1.remove(); this.bgLayer2.remove(); this.overlay.remove(); }
    }

    class PresetController {
        constructor(pdoc, pwin) {
            this.pdoc = pdoc; 
            this.pwin = pwin;
            
            // ---CONFIG_START---
            this.DEFAULT_CONFIG = [
          {
                    "id": "world_type",
                    "title": "世界设定",
                    "type": "radio",
                    "items": [
                              {
                                        "label": "日常",
                                        "kw": "日常混沌"
                              },
                              {
                                        "label": "色欲",
                                        "kw": "色欲混沌"
                              },
                              {
                                        "label": "奋斗",
                                        "kw": "奋斗混沌"
                              },
                              {
                                        "label": "感情",
                                        "kw": "感情混沌"
                              },
                              {
                                        "label": "轻小说",
                                        "kw": "轻小说混沌"
                              },
                              {
                                        "label": "病态",
                                        "kw": "病态混沌"
                              },
                              {
                                        "label": "出轨",
                                        "kw": "出轨混沌"
                              },
                              {
                                        "label": "诡异",
                                        "kw": "诡异混沌"
                              }
                    ]
          },
          {
                    "id": "pacing",
                    "title": "推进速度",
                    "type": "radio",
                    "items": [
                              {
                                        "label": "慢速推进",
                                        "kw": "慢速推进"
                              },
                              {
                                        "label": "快速推进",
                                        "kw": "快速推进"
                              }
                    ]
          },
          {
                    "id": "interact",
                    "title": "指令倾向",
                    "type": "radio",
                    "items": [
                              {
                                        "label": "推剧情",
                                        "kw": "推剧情"
                              },
                              {
                                        "label": "复述",
                                        "kw": "复述"
                              },
                              {
                                        "label": "防抢话",
                                        "kw": "防抢话"
                              },
                              {
                                        "label": "复合型",
                                        "kw": "复合型"
                              }
                    ]
          },
          {
                    "id": "style",
                    "title": "文风风格",
                    "type": "radio",
                    "items": [
                              {
                                        "label": "恋爱喜剧",
                                        "kw": "恋爱喜剧"
                              },
                              {
                                        "label": "压抑色情",
                                        "kw": "压抑色情文风"
                              },
                              {
                                        "label": "重轻小说",
                                        "kw": "重轻小说"
                              },
                              {
                                        "label": "克制白描",
                                        "kw": "克制白描"
                              },
                              {
                                        "label": "Galgame",
                                        "kw": "galgame"
                              },
                              {
                                        "label": "成人童话",
                                        "kw": "成人童话"
                              },
                              {
                                        "label": "禁忌爱情",
                                        "kw": "禁忌爱情"
                              },
                              {
                                        "label": "现实世界",
                                        "kw": "现实世界文风"
                              },
                              {
                                        "label": "诡异世界",
                                        "kw": "诡异世界文风"
                              },
                              {
                                        "label": "色情淫靡",
                                        "kw": "⌨️色情淫靡文风"
                              }
                    ]
          },
          {
                    "id": "pov",
                    "title": "叙事视角",
                    "type": "radio",
                    "items": [
                              {
                                        "label": "Char第一",
                                        "kw": "char第一人称"
                              },
                              {
                                        "label": "User第一",
                                        "kw": "user第一人称"
                              },
                              {
                                        "label": "User第二",
                                        "kw": "user第二人称"
                              },
                              {
                                        "label": "第三人称",
                                        "kw": "第三视角人称"
                              },
                              {
                                        "label": "自由视角",
                                        "kw": "自由视角人称"
                              }
                    ]
          },
          {
                    "id": "chastity",
                    "title": "贞操观念",
                    "type": "radio",
                    "items": [
                              {
                                        "label": "正常观念",
                                        "kw": "🐦‍🔥正常观念"
                              },
                              {
                                        "label": "男女平等",
                                        "kw": "男女平等"
                              },
                              {
                                        "label": "贞操逆转",
                                        "kw": "贞操逆转"
                              },
                              {
                                        "label": "扶她观念",
                                        "kw": "🐦‍🔥扶她观念"
                              }
                    ]
          },
          {
                    "id": "personality",
                    "title": "女性性格",
                    "type": "radio",
                    "items": [
                              {
                                        "label": "正常人",
                                        "kw": "正常人"
                              },
                              {
                                        "label": "正直",
                                        "kw": "正直"
                              },
                              {
                                        "label": "虚伪",
                                        "kw": "虚伪"
                              },
                              {
                                        "label": "婊子",
                                        "kw": "婊子"
                              },
                              {
                                        "label": "变态",
                                        "kw": "变态"
                              },
                              {
                                        "label": "色鬼",
                                        "kw": "色鬼"
                              }
                    ]
          },
          {
                    "id": "desc_focus",
                    "title": "女性描写",
                    "type": "radio",
                    "items": [
                              {
                                        "label": "母猪化",
                                        "kw": "母猪化"
                              },
                              {
                                        "label": "油腻化",
                                        "kw": "油腻化"
                              },
                              {
                                        "label": "色情化",
                                        "kw": "色情化"
                              }
                    ]
          },
          {
                    "id": "nsfw_style",
                    "title": "禁果风格",
                    "type": "radio",
                    "items": [
                              {
                                        "label": "温柔瑟瑟",
                                        "kw": "温柔瑟瑟"
                              },
                              {
                                        "label": "粗俗瑟瑟",
                                        "kw": "粗俗瑟瑟"
                              }
                    ]
          },
          {
                    "id": "nsfw_spec",
                    "title": "瑟瑟特化",
                    "type": "radio",
                    "items": [
                              {
                                        "label": "素股BG",
                                        "kw": "素股BG"
                              },
                              {
                                        "label": "BG粗俗",
                                        "kw": "BG粗俗"
                              },
                              {
                                        "label": "BG柔和",
                                        "kw": "BG柔和"
                              },
                              {
                                        "label": "GL描写",
                                        "kw": "GL描写"
                              }
                    ]
          },
          {
                    "id": "customs",
                    "title": "风俗文化",
                    "type": "multi",
                    "items": [
                              {
                                        "label": "绿帽癖",
                                        "kw": "女性绿帽癖"
                              },
                              {
                                        "label": "淫语文化",
                                        "kw": "淫语文化"
                              },
                              {
                                        "label": "服装色情",
                                        "kw": "服装色情"
                              },
                              {
                                        "label": "露出文化",
                                        "kw": "露出文化"
                              },
                              {
                                        "label": "轻视男性",
                                        "kw": "轻视男性"
                              },
                              {
                                        "label": "色情纹身",
                                        "kw": "色情纹身"
                              },
                              {
                                        "label": "带性玩具",
                                        "kw": "随身携带性玩具"
                              },
                              {
                                        "label": "肮脏文化",
                                        "kw": "肮脏文化"
                              }
                    ]
          },
          {
                    "id": "language",
                    "title": "语言模组",
                    "type": "multi",
                    "items": [
                              {
                                        "label": "语言强势",
                                        "kw": "语言强势"
                              },
                              {
                                        "label": "调教蜜语",
                                        "kw": "蜜语特化"
                              },
                              {
                                        "label": "粗俗淫语",
                                        "kw": "淫语特化"
                              },
                              {
                                        "label": "ASMR补丁",
                                        "kw": "ASMR涩涩对白"
                              }
                    ]
          },
          {
                    "id": "body",
                    "title": "身体模组",
                    "type": "multi",
                    "items": [
                              {
                                        "label": "爱液丰富",
                                        "kw": "爱液丰富"
                              },
                              {
                                        "label": "身体糜烂",
                                        "kw": "身体糜烂"
                              },
                              {
                                        "label": "气味浓郁",
                                        "kw": "气味浓郁"
                              },
                              {
                                        "label": "气味臭秽",
                                        "kw": "气味臭秽"
                              },
                              {
                                        "label": "乳汁丰富",
                                        "kw": "乳汁丰富"
                              },
                              {
                                        "label": "热气腾腾",
                                        "kw": "热气腾腾"
                              },
                              {
                                        "label": "毛发特化",
                                        "kw": "毛发特化"
                              },
                              {
                                        "label": "丰腴大车",
                                        "kw": "丰腴大车"
                              },
                              {
                                        "label": "女>>男(体型)",
                                        "kw": "体型差(女>>男)"
                              },
                              {
                                        "label": "男>>女(体型)",
                                        "kw": "体型差(男>>女)"
                              },
                              {
                                        "label": "身体脏乱",
                                        "kw": "身体脏乱"
                              }
                    ]
          },
          {
                    "id": "special",
                    "title": "特殊模组",
                    "type": "multi",
                    "items": [
                              {
                                        "label": "多角色(NP)",
                                        "kw": "多角色瑟瑟"
                              },
                              {
                                        "label": "女性抖M",
                                        "kw": "女性抖m"
                              },
                              {
                                        "label": "女性抖S",
                                        "kw": "女性抖s"
                              },
                              {
                                        "label": "射精特写",
                                        "kw": "射精描写"
                              }
                    ]
          },
          {
                    "id": "bans",
                    "title": "强制禁令",
                    "type": "multi",
                    "items": [
                              {
                                        "label": "异常限制",
                                        "kw": "异常限制"
                              },
                              {
                                        "label": "禁用句式",
                                        "kw": "禁用句式"
                              },
                              {
                                        "label": "禁用词语",
                                        "kw": "禁用词语"
                              },
                              {
                                        "label": "外貌限制",
                                        "kw": "外貌限制"
                              },
                              {
                                        "label": "进度限制",
                                        "kw": "进度限制"
                              },
                              {
                                        "label": "剧情限制",
                                        "kw": "剧情限制"
                              },
                              {
                                        "label": "物化限制",
                                        "kw": "物化限制"
                              },
                              {
                                        "label": "人设限制",
                                        "kw": "人设限制"
                              },
                              {
                                        "label": "发情限制",
                                        "kw": "发情限制"
                              },
                              {
                                        "label": "女尊限制",
                                        "kw": "女尊限制"
                              },
                              {
                                        "label": "昏厥限制",
                                        "kw": "昏厥限制"
                              }
                    ]
          },
          {
                    "id": "system",
                    "title": "系统机制",
                    "type": "multi",
                    "items": [
                              {
                                        "label": "反截断",
                                        "kw": "反截断需要再开"
                              },
                              {
                                        "label": "摘要",
                                        "kw": "🪪摘要"
                              },
                              {
                                        "label": "梦呓协定",
                                        "kw": "梦呓协定"
                              },
                              {
                                        "label": "互动选项",
                                        "kw": "🪪选项"
                              },
                              {
                                        "label": "状态栏·正常",
                                        "kw": "状态栏·正常"
                              },
                              {
                                        "label": "状态栏·女尊",
                                        "kw": "状态栏·女尊"
                              },
                              {
                                        "label": "状态栏·扶她",
                                        "kw": "状态栏·扶她"
                              }
                    ]
          }
];
            // ---CONFIG_END---
            
            this.config = JSON.parse(JSON.stringify(this.DEFAULT_CONFIG));
            this.isEditMode = false; 
            this.container = this.pdoc.getElementById('preset-list-container');
            this.dragSrcEl = null;
            this.dragSrcCatIdx = null;
            this.dragSrcItemIdx = null;
        }
        
        initialize() { this.render(); this._attachEventListeners(); this.startSyncTimer(); }
        
        _isPromptEnabled(li) {
            if (!li) return false;
            return !li.classList.contains('completion_prompt_manager_prompt_disabled');
        }
        
        _findByContains(keyword) {
            const list = this.pdoc.querySelector('#completion_prompt_manager_list, #prompt_manager_list');
            if (!list) return [];
            const kw = keyword.toLowerCase();
            return Array.from(list.querySelectorAll('li[data-pm-identifier]')).filter(li => {
                const nameEl = li.querySelector('[data-pm-name]');
                if (!nameEl) return false;
                const name = (nameEl.getAttribute('data-pm-name') || '').toLowerCase();
                return name.includes(kw);
            });
        }
        
        _clickToggle(li) {
            if (!li) return;
            const btn = li.querySelector('.prompt-manager-toggle-action');
            if (btn) btn.click();
        }
        
        _ensureOnContains(keyword) { this._findByContains(keyword).forEach(li => { if (!this._isPromptEnabled(li)) this._clickToggle(li); }); }
        _ensureOffContains(keyword) { this._findByContains(keyword).forEach(li => { if (this._isPromptEnabled(li)) this._clickToggle(li); }); }

        render() {
            this.container.innerHTML = this.config.map((cat, catIdx) => `
                <div class="preset-cat">✦ ${cat.title} ${cat.type === 'multi' ? '<span style="font-weight:normal; font-size:10px; color:#A69E89;">(多选)</span>' : ''}</div>
                <div class="preset-list">
                    ${cat.items.map((item, itemIdx) => `
                        <div class="p-item" ${this.isEditMode ? 'draggable="true"' : ''} data-c="${catIdx}" data-i="${itemIdx}" data-t="${cat.type}" data-k="${item.kw}">
                            ${item.label}<div class="p-del">x</div>
                        </div>`).join('')}
                    <div class="p-add" data-c="${catIdx}">+ 添加</div>
                </div>`).join('');
            this.syncStates();
        }

        syncStates() {
            const listExists = this.pdoc.querySelector('#completion_prompt_manager_list, #prompt_manager_list');
            if (!listExists) return;
            this.container.querySelectorAll('.p-item').forEach(btn => {
                const kw = btn.getAttribute('data-k');
                const matches = this._findByContains(kw);
                const isEnabled = matches.length > 0 && matches.some(li => this._isPromptEnabled(li));
                btn.classList.toggle('is-on', isEnabled);
            }); 
        }
        
        startSyncTimer() { 
            if (window.thEnvRafs.presetTimer) clearInterval(window.thEnvRafs.presetTimer);
            window.thEnvRafs.presetTimer = setInterval(() => { this.syncStates(); }, 1000); 
        }

        _attachEventListeners() {
            this.container.addEventListener('click', (e) => {
                const target = e.target; 
                if (target.classList.contains('p-del')) { e.stopPropagation(); this._handleDelete(e); }
                else if (target.classList.contains('p-add')) { e.stopPropagation(); this._handleAdd(e); }
                else { const btn = target.closest('.p-item'); if (btn && !this.isEditMode) this._handleToggle(btn); } 
            });
            
            this.pdoc.getElementById('btn-edit-preset').onclick = (e) => this._toggleEditMode(e.target);
            this.pdoc.getElementById('btn-export-preset').onclick = () => this._exportFullScript();

            this.container.addEventListener('dragstart', (e) => {
                if (!this.isEditMode) { e.preventDefault(); return; }
                const pItem = e.target.closest('.p-item');
                if (!pItem) return;
                this.dragSrcEl = pItem;
                this.dragSrcCatIdx = parseInt(pItem.getAttribute('data-c'));
                this.dragSrcItemIdx = parseInt(pItem.getAttribute('data-i'));
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/html', pItem.innerHTML);
                setTimeout(() => pItem.classList.add('is-dragging'), 0);
            });

            this.container.addEventListener('dragover', (e) => {
                if (!this.isEditMode) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const target = e.target.closest('.p-item');
                if (target && target !== this.dragSrcEl) {
                    target.classList.add('drag-over');
                }
            });

            this.container.addEventListener('dragleave', (e) => {
                const target = e.target.closest('.p-item');
                if (target) target.classList.remove('drag-over');
            });

            this.container.addEventListener('drop', (e) => {
                if (!this.isEditMode) return;
                e.stopPropagation();
                const target = e.target.closest('.p-item');
                if (target) target.classList.remove('drag-over');

                if (this.dragSrcEl && target && this.dragSrcEl !== target) {
                    const tgtCatIdx = parseInt(target.getAttribute('data-c'));
                    const tgtItemIdx = parseInt(target.getAttribute('data-i'));
                    const itemData = this.config[this.dragSrcCatIdx].items.splice(this.dragSrcItemIdx, 1)[0];
                    this.config[tgtCatIdx].items.splice(tgtItemIdx, 0, itemData);
                    this.render();
                }
            });

            this.container.addEventListener('dragend', (e) => {
                if (this.dragSrcEl) this.dragSrcEl.classList.remove('is-dragging');
                this.container.querySelectorAll('.p-item').forEach(el => el.classList.remove('drag-over'));
                this.dragSrcEl = null;
            });
        }
        
        _handleDelete(e) { 
            const pBtn = e.target.closest('.p-item'); 
            const catIdx = parseInt(pBtn.getAttribute('data-c')); 
            const itemIdx = parseInt(pBtn.getAttribute('data-i')); 
            this.config[catIdx].items.splice(itemIdx, 1); 
            this.render(); 
        }
        
        _handleAdd(e) { 
            const catIdx = parseInt(e.target.getAttribute('data-c')); 
            const label = prompt('按钮显示名称:'); if (!label) return; 
            const kw = prompt('对应的底层预设关键字:'); if (!kw) return; 
            this.config[catIdx].items.push({ label: label.trim(), kw: kw.trim() }); 
            this.render(); 
        }
        
        _handleToggle(btn) {
            const listExists = this.pdoc.querySelector('#completion_prompt_manager_list');
            if (!listExists) {
                alert("请先打开酒馆右侧栏的【预设管理】面板，否则无法找到预设！");
                return;
            }
            const type = btn.getAttribute('data-t'); 
            const kw = btn.getAttribute('data-k'); 
            const catIdx = parseInt(btn.getAttribute('data-c')); 
            const isActive = btn.classList.contains('is-on');
            
            if (type === 'radio') { 
                this.config[catIdx].items.forEach(item => this._ensureOffContains(item.kw)); 
                this.container.querySelectorAll(`.p-item[data-c="${catIdx}"]`).forEach(b => b.classList.remove('is-on')); 
                if (!isActive) { this._ensureOnContains(kw); btn.classList.add('is-on'); } 
            } else { 
                if (isActive) { this._ensureOffContains(kw); btn.classList.remove('is-on'); } 
                else { this._ensureOnContains(kw); btn.classList.add('is-on'); } 
            }
            
            setTimeout(() => { 
                this.syncStates(); 
                const updateBtn = this.pdoc.getElementById('update_oai_preset');
                if (updateBtn) updateBtn.click();
            }, 200);
        }

        _toggleEditMode(btn) { 
            this.isEditMode = !this.isEditMode; 
            this.pdoc.getElementById('th-unified-env-engine-wrapper').classList.toggle('is-edit-mode', this.isEditMode); 
            btn.innerText = this.isEditMode ? '✅ 结束排序/编辑' : '⚙️ 拖拽/增减'; 
            btn.style.background = this.isEditMode ? '#857B64' : 'transparent'; 
            btn.style.color = this.isEditMode ? '#fff' : '#D6CBB4';
            
            const expBtn = this.pdoc.getElementById('btn-export-preset');
            if (this.isEditMode) {
                expBtn.style.display = 'inline-block';
            } else {
                expBtn.style.display = 'none';
            }
            this.render();
        }
        
        _exportFullScript() { 
            let coreStr = coreLogic.toString();
            const configJson = JSON.stringify(this.config, null, 10).trim();
            const replacementString = `// ---CONFIG_START---\n            this.DEFAULT_CONFIG = ${configJson};\n            // ---CONFIG_END---`;
            coreStr = coreStr.replace(/\/\/ ---CONFIG_START---[\s\S]*?\/\/ ---CONFIG_END---/, () => replacementString);

            const finalScript = `// ==UserScript==
// @name         SillyTavern Unified Env Engine (白金大马士革版)
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  支持背景管理与预设面板拖拽排序，导出修改后的【全部完整代码】一键覆盖原有脚本。全新白金深蓝大马士革 UI 风格。
// @author       You
// @match        *://*/*
// @grant        none
// ==/UserScript==

$(errorCatched(async () => {

${coreStr}

coreLogic();

}));`;
            
            const overlayHtml = `
                <div id="th-export-overlay" style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.95);z-index:2147483647;display:flex;justify-content:center;align-items:center;flex-direction:column;padding:20px;box-sizing:border-box;">
                    <h3 style="color:#D6CBB4;margin-bottom:10px;">📋 一键导出修改后的【完整脚本】</h3>
                    <p style="color:#ccc;font-size:14px;margin-bottom:15px;text-align:center;">
                        点击下方按钮，会自动将下方框内的所有代码（包含你修改后的预设）复制到剪贴板。<br>
                        你只需要去<span style="color:#50fa7b;font-weight:bold;">油猴脚本管理器</span>中，<span style="color:#ff5555;font-weight:bold;">Ctrl+A 全选旧代码，再 Ctrl+V 粘贴覆盖保存即可</span>。
                    </p>
                    <textarea id="th-export-area" style="width:95%;max-width:900px;height:65vh;background:#1E2235;color:#EBE5D9;font-family:monospace;padding:15px;border:1px solid #D6CBB4;border-radius:8px;resize:none;" readonly></textarea>
                    <div style="margin-top:20px;display:flex;gap:15px;">
                        <button id="th-export-copy" style="padding:12px 25px;background:#D6CBB4;color:#1E2235;border:none;border-radius:6px;cursor:pointer;font-weight:bold;font-size:16px;">📋 点击一键全选并复制</button>
                        <button id="th-export-close" style="padding:12px 25px;background:transparent;color:#D6CBB4;border:1px solid #D6CBB4;border-radius:6px;cursor:pointer;font-weight:bold;font-size:16px;">❌ 关闭</button>
                    </div>
                </div>
            `;
            this.pdoc.body.insertAdjacentHTML('beforeend', overlayHtml);
            const area = this.pdoc.getElementById('th-export-area');
            area.value = finalScript;
            
            this.pdoc.getElementById('th-export-copy').onclick = (e) => {
                area.select();
                this.pdoc.execCommand('copy');
                e.target.innerText = "✅ 复制成功，去油猴粘贴吧！";
                setTimeout(() => e.target.innerText = "📋 点击一键全选并复制", 3000);
            };
            
            this.pdoc.getElementById('th-export-close').onclick = () => {
                this.pdoc.getElementById('th-export-overlay').remove();
            };
        }
    }

    class UnifiedEnvEngine {
        constructor() {
            this.ID = 'th-unified-env-engine'; 
            this.BG_STORAGE_KEY = 'TH_Bg_Engine_Config_V12'; 
            this.POS_STORAGE_KEY = 'TH_UnifiedPanel_Pos';
            this.pdoc = pdoc; 
            this.pwin = pwin;
            this.elements = {}; 
        }

        async run() {
            this._cleanupOldInstances(); this._injectStyles(); this._createDOM(); this._cacheDOMElements(); this._initUIInteraction();
            this.pdoc.body.classList.add('th-env-engine-active');
            this.backgroundManager = new BackgroundManager(this.pdoc, this.pwin, this.BG_STORAGE_KEY, { bgLayer1: `${this.ID}-bgLayer1`, bgLayer2: `${this.ID}-bgLayer2`, overlay: `${this.ID}-overlay` });
            this.presetController = new PresetController(this.pdoc, this.pwin);
            await this.backgroundManager.initialize(); 
            this.presetController.initialize(); 
        }

        _cleanupOldInstances() { 
            const idsToRemove = [ `${this.ID}-wrapper`, `${this.ID}-orb`, `${this.ID}-style`, `${this.ID}-bgLayer1`, `${this.ID}-bgLayer2`, `${this.ID}-overlay`, 'th-gallery-overlay', 'th-export-overlay' ]; 
            idsToRemove.forEach(id => this.pdoc.getElementById(id)?.remove()); 
        }

        _injectStyles() {
            const style = this.pdoc.createElement('style'); style.id = `${this.ID}-style`;
            // 白金色大马士革无缝 SVG 图案
            const damaskFloral = `data:image/svg+xml,%3Csvg width='80' height='80' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='%23EBE5D9' stroke-width='1.2' opacity='0.18'%3E%3Cpath d='M40 10C50 20 60 20 70 40C60 60 50 60 40 70C30 60 20 60 10 40C20 20 30 20 40 10Z'/%3E%3Cpath d='M40 25C45 32 50 35 55 40C50 45 45 48 40 55C35 48 30 45 25 40C30 35 35 32 40 25Z'/%3E%3Cpath d='M40 0C55 10 70 5 80 20M40 80C55 70 70 75 80 60M40 0C25 10 10 5 0 20M40 80C25 70 10 75 0 60'/%3E%3Ccircle cx='40' cy='40' r='5'/%3E%3Ccircle cx='0' cy='0' r='10'/%3E%3Ccircle cx='80' cy='0' r='10'/%3E%3Ccircle cx='0' cy='80' r='10'/%3E%3Ccircle cx='80' cy='80' r='10'/%3E%3Cpath d='M20 0C20 15 0 20 0 20M60 0C60 15 80 20 80 20M20 80C20 65 0 60 0 60M60 80C60 65 80 60 80 60'/%3E%3C/g%3E%3C/svg%3E`;
            
            style.textContent = `
                :root { --th-overlay-dark: rgba(0, 0, 0, 0); --th-bubble-bg: transparent; --th-bubble-blur: none; --th-bubble-shadow: none; --th-ui-bg: rgba(30, 34, 53, 0.4); --th-safe-blur: blur(6px); --th-view-offset-y: 50%; --th-bg-size: 100% auto; } 
                body.th-env-engine-active #bg1, body.th-env-engine-active #bg2 { z-index: -20 !important; } body.th-custom-bg-active #bg1, body.th-custom-bg-active #bg2 { display: none !important; } 
                body.th-env-engine-active #main_wrapper, body.th-env-engine-active #chat_list, body.th-env-engine-active #chat, body.th-env-engine-active .mes_list, body.th-env-engine-active #sheld { background-color: transparent !important; background-image: none !important; box-shadow: none !important; } 
                #left_drawer, #right_drawer, .drawer-content, #top-nav, .panel, .popup, .menu_button, .list-group-item, .title_bar, #user_avatar_block, #nav_panel, #extensions_info { background-color: var(--th-ui-bg) !important; background-image: none !important; transition: background-color 0.3s; } 
                #send_form { background-color: var(--th-ui-bg) !important; background-image: none !important; backdrop-filter: var(--th-safe-blur) !important; -webkit-backdrop-filter: var(--th-safe-blur) !important; } 
                .mes { background-color: var(--th-bubble-bg) !important; backdrop-filter: var(--th-bubble-blur) !important; -webkit-backdrop-filter: var(--th-bubble-blur) !important; box-shadow: var(--th-bubble-shadow) !important; border-color: transparent !important; transition: all 0.3s !important; } 
                
                .th-bg-layer { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background-color: #000; background-size: var(--th-bg-size); background-position: center var(--th-view-offset-y); background-repeat: no-repeat; z-index: -15; pointer-events: none; transition: opacity 1.5s ease-in-out, background-size 0.3s; opacity: 0; will-change: background-position; transform: translateZ(0) scale(1.005); -webkit-transform: translateZ(0) scale(1.005); image-rendering: high-quality; }
                #${this.ID}-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: var(--th-overlay-dark); z-index: -14; pointer-events: none; transition: background 0.3s ease; } 
                
                #${this.ID}-orb {
                    position: fixed; z-index: 2147483647; width: 54px; height: 54px; border-radius: 50%;
                    background: radial-gradient(circle at 30% 30%, #ffffff 0%, #e5e0d4 40%, #a39c89 100%);
                    border: 2px solid #fff; box-shadow: 0 0 15px rgba(214, 203, 180, 0.5), inset 0 0 10px rgba(0,0,0,0.2);
                    display: flex; justify-content: center; align-items: center; cursor: pointer; touch-action: none;
                    transition: transform 0.3s, opacity 0.3s, box-shadow 0.3s; user-select: none; -webkit-user-select: none;
                }
                #${this.ID}-orb::before {
                    content: '❁'; font-size: 28px; color: #4a4c59; line-height: 1; text-shadow: 0 1px 2px rgba(255,255,255,0.8);
                    animation: th-orb-spin 8s linear infinite;
                }
                #${this.ID}-orb:hover { transform: scale(1.05); box-shadow: 0 0 25px rgba(214, 203, 180, 0.8); }
                @keyframes th-orb-spin { to { transform: rotate(360deg); } }

                #${this.ID}-wrapper { 
                    position: fixed; z-index: 2147483646; width: 340px; max-width: 90vw; 
                    height: auto; max-height: 85vh; background: #1E2235; background-image: url("${damaskFloral}");
                    border: 2px solid #D6CBB4; border-radius: 12px; 
                    box-shadow: 0 15px 40px rgba(0,0,0,0.9), 0 0 20px rgba(214,203,180,0.15); 
                    font-family: 'Georgia', sans-serif; color: #fff; 
                    display: flex; flex-direction: column; overflow: hidden; 
                    opacity: 0; pointer-events: none; transform: scale(0.9) translateY(20px);
                    transition: opacity 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28), transform 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
                }
                #${this.ID}-wrapper.is-open { opacity: 1; pointer-events: auto; transform: scale(1) translateY(0); }

                .uni-header { 
                    padding: 12px 15px; background: linear-gradient(180deg, #2b3044 0%, #1f2335 100%); 
                    border-bottom: 1px solid #D6CBB4; cursor: grab; display: flex; justify-content: space-between; align-items: center; 
                    font-size: 15px; font-weight: bold; color: #EBE5D9; user-select: none; flex-shrink: 0; touch-action: none; 
                } 
                .uni-header:active { cursor: grabbing; }
                .uni-close-btn { cursor: pointer; padding: 0 5px; color: #D6CBB4; font-size: 18px; line-height: 1; transition: transform 0.2s, color 0.2s; } 
                .uni-close-btn:hover { color: #fff; transform: scale(1.2); }

                .uni-tabs { display: flex; background: rgba(0,0,0,0.4); flex-shrink: 0; border-bottom: 1px solid rgba(214,203,180,0.3); } 
                .uni-tab-btn { flex: 1; padding: 10px 0; text-align: center; font-size: 13px; cursor: pointer; background: transparent; color: #a1a3b5; border: none; font-family: inherit; } 
                .uni-tab-btn.active { color: #D6CBB4; font-weight: bold; background: rgba(214,203,180,0.15); box-shadow: inset 0 -2px 0 #D6CBB4;} 
                
                .uni-content { width: 100%; flex: 1; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; } 
                .uni-content::-webkit-scrollbar { width: 6px; }
                .uni-content::-webkit-scrollbar-thumb { background: #D6CBB4; border-radius: 3px; }
                
                .uni-panel-section { display: none; padding: 15px 15px 30px 15px; width: 100%; box-sizing: border-box; } 
                .uni-panel-section.active { display: block; } 
                
                .u-btn { background: transparent; color: #D6CBB4; border: 1px solid #D6CBB4; border-radius: 6px; padding: 6px; cursor: pointer; font-size: 12px; transition: 0.2s; text-align: center; } 
                .u-btn:hover { background: #D6CBB4; color: #1E2235; font-weight:bold; }
                .u-row { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #EBE5D9; margin-bottom: 12px; width: 100%; box-sizing: border-box; } 
                .u-row input[type="range"] { flex: 1; margin-left: 10px; min-width: 50px; accent-color: #D6CBB4; } 
                .u-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; width: 100%; } 
                
                #th-gallery-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(15, 18, 30, 0.95); z-index: 2147483647; display: none; flex-direction: column; opacity: 0; transition: opacity 0.3s; } 
                .th-g-header { padding: 15px 25px; display: flex; justify-content: space-between; background: rgba(0,0,0,0.6); border-bottom: 1px solid #D6CBB4; } 
                .th-g-grid { flex: 1; padding: 25px; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 15px; align-content: start; } 
                .th-g-item { position: relative; aspect-ratio: 16/9; border-radius: 8px; overflow: hidden; border: 1px solid #D6CBB4; } 
                .th-g-img { width: 100%; height: 100%; object-fit: contain; background: #000; } 
                .th-g-mask { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 10px; opacity: 0; } 
                .th-g-item:hover .th-g-mask { opacity: 1; } .th-g-btn { padding: 6px 15px; border-radius: 20px; border: 1px solid #D6CBB4; background: transparent; font-size: 12px; cursor: pointer; color: #D6CBB4; transition: 0.2s;} 
                .th-g-btn:hover { background: #D6CBB4; color: #1E2235; font-weight:bold; }
                
                /* ======================================= */
                /* 预设面本与拖拽相关样式 */
                /* ======================================= */
                #preset-list-container { width: 100%; box-sizing: border-box; }
                .preset-cat { 
                    font-size: 13px; color: #D6CBB4; margin: 15px 0 8px; 
                    padding-bottom: 4px; border-bottom: 1px solid rgba(214,203,180,0.3); 
                    font-weight: bold; text-shadow: 0 1px 2px rgba(0,0,0,0.5);
                } 
                .preset-list { display: flex; flex-wrap: wrap; gap: 8px; width: 100%; box-sizing: border-box; }
                
                .p-item { 
                    flex-shrink: 0; padding: 6px 12px; position: relative; font-size: 11px; text-align: center; 
                    background: rgba(0,0,0,0.4); border: 1px solid rgba(214,203,180,0.4); color: #EBE5D9; 
                    border-radius: 6px; cursor: pointer; transition: all 0.2s; box-sizing: border-box; 
                } 
                .p-item:hover { border-color: #D6CBB4; background: rgba(214,203,180,0.15); }
                .p-item.is-on { 
                    background: linear-gradient(135deg, #a69b82 0%, #D6CBB4 100%); 
                    border-color: #fff; color: #1E2235; font-weight: bold; box-shadow: 0 0 10px rgba(214,203,180,0.4);
                } 
                .p-add { 
                    display: none; flex-shrink: 0; padding: 6px 12px; font-size: 11px; text-align: center; 
                    border: 1px dashed rgba(214,203,180,0.5); color: #D6CBB4; border-radius: 6px; cursor: pointer; 
                } 
                .p-add:hover { background: rgba(214,203,180,0.15); }
                
                .p-del { 
                    display: none; position: absolute; top: -6px; right: -6px; width: 18px; height: 18px; 
                    background: #e34234; color: #fff; border-radius: 50%; font-size: 10px; line-height: 18px; 
                    text-align: center; box-shadow: 0 0 4px rgba(0,0,0,0.8); z-index: 2; border: 1px solid #fff;
                } 

                .is-edit-mode .p-del { display: block; } 
                .is-edit-mode .p-add { display: block; }
                .is-edit-mode .p-item { cursor: grab; opacity: 0.8; }
                .is-edit-mode .p-item:active { cursor: grabbing; }
                
                .p-item.is-dragging { opacity: 0.3 !important; border: 1px dashed #D6CBB4; transform: scale(0.9); }
                .p-item.drag-over { border-left: 4px solid #fff; margin-left: 2px; }
            `;
            this.pdoc.head.appendChild(style);
        }

        _createDOM() {
            let savedPos = { x: 20, y: 50 };
            try { const sp = localStorage.getItem(this.POS_STORAGE_KEY); if (sp) savedPos = JSON.parse(sp); savedPos.x = Math.max(0, Math.min(savedPos.x, this.pwin.innerWidth - 60)); savedPos.y = Math.max(0, Math.min(savedPos.y, this.pwin.innerHeight - 60)); } catch (e) {}
            
            const domHtml = `
                <div id="${this.ID}-orb" style="left: ${savedPos.x}px; top: ${savedPos.y}px;"></div>

                <div id="${this.ID}-wrapper" style="left: ${Math.min(savedPos.x, this.pwin.innerWidth - 350)}px; top: ${Math.min(savedPos.y, this.pwin.innerHeight - 500)}px;"> 
                    <div class="uni-header" id="uni-head">
                        <span>❂ 繁花·世界</span>
                        <span class="uni-close-btn" id="uni-close">✖</span>
                    </div> 
                    <div class="uni-tabs" id="uni-tabs"> 
                        <button class="uni-tab-btn active" data-target="tab-preset">法典编织</button> 
                        <button class="uni-tab-btn" data-target="tab-bg">梦境帷幕</button> 
                    </div> 
                    <div class="uni-content" id="uni-content"> 
                        <div class="uni-panel-section" id="tab-bg"> 
                            <button class="u-btn" id="btn-open-gallery" style="width:100%; margin-bottom:10px;">🖼️ 帷幕图库管理</button> 
                            <div class="u-row"><span>状态: <span id="bg-status" style="color:#D6CBB4;">读取中...</span></span> <button class="u-btn" id="btn-clear-db" style="padding:2px 6px; color:#e34234; border-color:#e34234;">清空</button></div> <input type="file" id="bgUploader" multiple accept="image/*" style="display: none;"> <div class="u-grid-2"><button id="btn-trigger-upload" class="u-btn">📁 补充帷幕</button><button class="u-btn" id="btn-next-bg">⏭️ 下一张</button></div> 
                            
                            <div class="u-row"><span>缩放</span> <select id="bgSizeMode" style="background:#1E2235; color:#EBE5D9; border:1px solid #D6CBB4; border-radius:4px; padding:2px;">
                                <option value="100% auto">适应宽度(防裁切)</option>
                                <option value="cover">填充全屏</option>
                                <option value="contain">完整留白</option>
                            </select></div>
                            
                            <div class="u-row"><span>自动轮播</span> <input type="checkbox" id="autoRotate" style="accent-color:#D6CBB4;"><span>间隔(秒)</span> <input type="number" id="rotateInterval" style="width:40px; background:#1E2235; color:#EBE5D9; border:1px solid #D6CBB4; border-radius:4px; text-align:center;"></div> 
                            <div class="u-row" style="margin-bottom:2px;"><span>虚空遮罩 (<span id="v-dark">0</span>%)</span></div><div class="u-row"><input type="range" id="r-dark" min="0" max="95" value="0"></div> 
                            <div class="u-row" style="margin-bottom:2px;"><span>记忆显影 (<span id="v-bub">0</span>%)</span></div><div class="u-row"><input type="range" id="r-bub" min="0" max="100" value="0"></div> 
                            <div class="u-row" style="margin-bottom:2px;"><span>界面不透 (<span id="v-ui">40</span>%)</span></div><div class="u-row"><input type="range" id="r-ui" min="0" max="100" value="40"></div> 
                            <div class="u-row" style="margin-bottom:2px;"><span>穹顶偏移 (底-1~1顶)</span><input type="number" id="n-view" step="0.01" style="width:50px; background:#1E2235; color:#EBE5D9; border:1px solid #D6CBB4; border-radius:4px; text-align:center;"></div><div class="u-row"><input type="range" id="r-view" min="-1" max="1" step="0.01" value="0"></div> 
                            <div class="u-row" style="margin-bottom:2px;"><span>时空流速: <span id="v-scroll"></span></span><input type="number" id="scroll-speed-num" step="0.5" style="width:50px; background:#1E2235; color:#EBE5D9; border:1px solid #D6CBB4; border-radius:4px; text-align:center;"></div><div class="u-row"><input type="range" id="r-scroll" min="-10" max="10" step="0.5" value="0"></div> 
                        </div> 
                        <div class="uni-panel-section active" id="tab-preset"> 
                            <div class="u-row" style="margin-bottom:5px;">
                                <button class="u-btn" id="btn-edit-preset" style="padding:4px 10px; border-radius:15px;">⚙️ 拖拽/增减</button>
                                <button class="u-btn" id="btn-export-preset" style="display:none; padding:4px 10px; border-radius:15px; border-color:#50fa7b; color:#50fa7b;">📋 一键导出修改后的全部代码</button>
                            </div> 
                            <div id="preset-list-container"></div> 
                        </div> 
                    </div> 
                </div>
                <div id="th-gallery-overlay"><div class="th-g-header"><div style="font-size:16px; color:#D6CBB4; font-weight:bold;">全屏图库 <span id="th-g-count"></span></div><button id="btn-close-gallery" style="background:none; border:none; color:#e34234; font-size:24px; cursor:pointer;">✖</button></div><div class="th-g-grid" id="th-gallery-grid"></div></div>
            `;
            const container = this.pdoc.createElement('div'); container.innerHTML = domHtml; while(container.firstChild) { this.pdoc.body.appendChild(container.firstChild); }
        }

        _cacheDOMElements() { 
            this.elements.orb = this.pdoc.getElementById(`${this.ID}-orb`); 
            this.elements.wrapper = this.pdoc.getElementById(`${this.ID}-wrapper`); 
            this.elements.head = this.pdoc.getElementById('uni-head'); 
            this.elements.closeBtn = this.pdoc.getElementById('uni-close'); 
        }

        _initUIInteraction() {
            this.pdoc.querySelectorAll('.uni-tab-btn').forEach(btn => { 
                btn.onclick = () => { 
                    this.pdoc.querySelectorAll('.uni-tab-btn').forEach(b => b.classList.remove('active')); 
                    this.pdoc.querySelectorAll('.uni-panel-section').forEach(s => s.classList.remove('active')); 
                    btn.classList.add('active'); 
                    this.pdoc.getElementById(btn.getAttribute('data-target')).classList.add('active'); 
                }; 
            });

            const openPanel = () => {
                this.elements.orb.style.opacity = '0';
                this.elements.orb.style.pointerEvents = 'none';
                const orbRect = this.elements.orb.getBoundingClientRect();
                let pX = orbRect.left - 280; if (pX < 10) pX = 10;
                let pY = orbRect.top; if (pY + this.elements.wrapper.offsetHeight > this.pwin.innerHeight) pY = this.pwin.innerHeight - this.elements.wrapper.offsetHeight - 10;
                
                this.elements.wrapper.style.left = `${pX}px`;
                this.elements.wrapper.style.top = `${pY}px`;
                this.elements.wrapper.classList.add('is-open');
            };

            const closePanel = () => {
                this.elements.wrapper.classList.remove('is-open');
                this.elements.orb.style.opacity = '1';
                this.elements.orb.style.pointerEvents = 'auto';
            };

            this.elements.closeBtn.onclick = (e) => { e.stopPropagation(); closePanel(); };
            this._setupDraggable(this.elements.orb, true, openPanel);
            this._setupDraggable(this.elements.head, false, null, this.elements.wrapper);
        }

        _setupDraggable(dragHandle, isOrb, onClickCallback, targetMoveElement = null) {
            const moveTarget = targetMoveElement || dragHandle;
            let isDragging = false, hasMoved = false, startPos = { x: 0, y: 0 }, dragOffset = { x: 0, y: 0 };
            
            const dragStart = (e) => { 
                if (e.target.classList.contains('uni-close-btn')) return;
                isDragging = true; hasMoved = false; 
                const pos = e.touches ? e.touches[0] : e; 
                startPos = { x: pos.clientX, y: pos.clientY }; 
                const rect = moveTarget.getBoundingClientRect(); 
                dragOffset = { x: pos.clientX - rect.left, y: pos.clientY - rect.top }; 
            };
            const dragMove = (e) => { 
                if (!isDragging) return; 
                e.preventDefault(); 
                const pos = e.touches ? e.touches[0] : e; 
                if (Math.abs(pos.clientX - startPos.x) > 5 || Math.abs(pos.clientY - startPos.y) > 5) hasMoved = true; 
                if (hasMoved) { 
                    let newX = pos.clientX - dragOffset.x; let newY = pos.clientY - dragOffset.y; 
                    newX = Math.max(0, Math.min(newX, this.pwin.innerWidth - moveTarget.offsetWidth)); 
                    newY = Math.max(0, Math.min(newY, this.pwin.innerHeight - moveTarget.offsetHeight)); 
                    moveTarget.style.left = `${newX}px`; moveTarget.style.top = `${newY}px`; 
                } 
            };
            const dragEnd = () => { 
                if (isDragging && hasMoved) { 
                    if(isOrb) localStorage.setItem(this.POS_STORAGE_KEY, JSON.stringify({ x: parseInt(moveTarget.style.left), y: parseInt(moveTarget.style.top) })); 
                } else if (isDragging && !hasMoved) { 
                    if (onClickCallback) onClickCallback();
                } 
                isDragging = false; hasMoved = false; 
            };
            
            dragHandle.addEventListener('mousedown', dragStart); dragHandle.addEventListener('touchstart', dragStart, { passive: false });
            this.pdoc.addEventListener('mousemove', dragMove, { passive: false }); this.pdoc.addEventListener('mouseup', dragEnd);
            this.pdoc.addEventListener('touchmove', dragMove, { passive: false }); this.pdoc.addEventListener('touchend', dragEnd);
        }
    }

    new UnifiedEnvEngine().run();
}

coreLogic();

}));
