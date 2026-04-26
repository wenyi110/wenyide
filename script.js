/**
 * 繁花 (Fanhua) - SillyTavern 字体更换扩展
 * @version 1.0.0
 * @description 允许用户选择界面字体，并支持上传自定义字体。
 */

(function () {
    const extensionName = 'Fanhua';
    const extensionFolderPath = `extensions/${extensionName}`;
    const fontFolderPath = `${extensionFolderPath}/fonts`;

    // 默认设置
    const defaultSettings = {
        selectedFont: 'Default',
        userFonts: [], // { name: 'My Font', url: '...' }
    };

    let settings = { ...defaultSettings };
    let fontStyleElement = null; // 用于注入 @font-face 和 body 样式的 <style> 元素

    // --- 核心功能 ---

    /**
     * 应用指定名称的字体
     * @param {string} fontName 要应用的字体名称
     */
    function applyFont(fontName) {
        if (!fontStyleElement) {
            console.error('[Fanhua] Style element not ready.');
            return;
        }

        // 如果是默认字体，则清空样式
        if (fontName === 'Default' || !fontName) {
            fontStyleElement.innerHTML = '';
            settings.selectedFont = 'Default';
            saveSettings();
            return;
        }

        // 查找字体定义（先从用户字体里找，再从内置字体里找）
        const allFonts = [...getBuiltInFonts(), ...settings.userFonts];
        const font = allFonts.find(f => f.name === fontName);

        if (!font) {
            console.warn(`[Fanhua] Font "${fontName}" not found. Reverting to default.`);
            applyFont('Default');
            return;
        }

        // 生成并注入 CSS
        const fontFaceRule = `
            @font-face {
                font-family: "${font.name}";
                src: url("${font.url}");
            }
        `;
        const bodyRule = `
            :root {
                --fanhua-font: "${font.name}", "Noto Sans", "Helvetica", "Arial", sans-serif;
            }
            body, #chat, .mes_text, input, textarea, button, select {
                font-family: var(--fanhua-font) !important;
            }
        `;

        fontStyleElement.innerHTML = fontFaceRule + bodyRule;
        settings.selectedFont = fontName;
        saveSettings();
        console.log(`[Fanhua] Applied font: ${fontName}`);
    }

    /**
     * 加载设置
     */
    async function loadSettings() {
        const loadedSettings = await getExtensionSettings(extensionName);
        settings = { ...defaultSettings, ...loadedSettings };
    }

    /**
     * 保存设置
     */
    function saveSettings() {
        saveExtensionSettings(extensionName, settings);
    }

    /**
     * 获取内置字体列表
     * @returns {Array<{name: string, url: string}>}
     */
    function getBuiltInFonts() {
        return [
            { name: '思源宋体 (Noto Serif SC)', url: `${fontFolderPath}/NotoSerifSC-Regular.otf` },
            // 你可以在这里添加更多内置字体
        ];
    }

    // --- UI 相关 ---

    /**
     * 填充字体选择下拉框
     */
    function populateFontSelect() {
        const selectElement = document.getElementById('fanhua_font_select');
        if (!selectElement) return;

        const allFonts = [{ name: 'Default' }, ...getBuiltInFonts(), ...settings.userFonts];
        
        selectElement.innerHTML = '';
        allFonts.forEach(font => {
            const option = document.createElement('option');
            option.value = font.name;
            option.textContent = font.name;
            selectElement.appendChild(option);
        });

        selectElement.value = settings.selectedFont;
    }

    /**
     * 渲染用户上传的字体列表
     */
    function renderUserFontList() {
        const listElement = document.getElementById('fanhua_user_font_list');
        if (!listElement) return;

        listElement.innerHTML = '';
        if (settings.userFonts.length === 0) {
            listElement.innerHTML = '<p>尚未添加任何自定义字体。</p>';
            return;
        }

        const ul = document.createElement('ul');
        settings.userFonts.forEach(font => {
            const li = document.createElement('li');
            li.textContent = font.name;

            const deleteButton = document.createElement('button');
            deleteButton.textContent = '删除';
            deleteButton.classList.add('fanhua-delete-btn');
            deleteButton.addEventListener('click', () => handleDeleteFont(font.name));

            li.appendChild(deleteButton);
            ul.appendChild(li);
        });
        listElement.appendChild(ul);
    }

    /**
     * 处理字体文件上传
     * @param {Event} event
     */
    async function handleFontUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const toast = Toaster.newToaster();
        toast.showLoading(`正在上传字体 ${file.name}...`);

        try {
            // 使用 SillyTavern 的文件上传 API
            const response = await uploadFile(file, fontFolderPath);
            if (!response.ok) {
                throw new Error('Upload failed');
            }
            const data = await response.json();
            const fontUrl = data.path;

            // 从文件名中提取字体名称
            const fontName = file.name.split('.').slice(0, -1).join('.') || 'Unnamed Font';

            if (settings.userFonts.some(f => f.name === fontName)) {
                 toast.showError(`名为 "${fontName}" 的字体已存在。`);
                 return;
            }

            settings.userFonts.push({ name: fontName, url: fontUrl });
            saveSettings();
            
            // 刷新 UI
            populateFontSelect();
            renderUserFontList();

            toast.showSuccess(`字体 "${fontName}" 添加成功！`);
        } catch (error) {
            console.error('[Fanhua] Font upload failed:', error);
            toast.showError('字体上传失败，请查看控制台获取详情。');
        } finally {
            // 清空 input，以便可以再次上传同名文件
            event.target.value = '';
        }
    }

    /**
     * 处理删除字体
     * @param {string} fontNameToDelete 
     */
    function handleDeleteFont(fontNameToDelete) {
        // SillyTavern 目前没有提供安全的删除文件 API，所以我们只从设置中移除
        // 这样做可以避免意外删除重要文件
        settings.userFonts = settings.userFonts.filter(font => font.name !== fontNameToDelete);
        
        // 如果删除的是当前选中的字体，则切换回默认字体
        if (settings.selectedFont === fontNameToDelete) {
            applyFont('Default');
            document.getElementById('fanhua_font_select').value = 'Default';
        }

        saveSettings();
        renderUserFontList();
        populateFontSelect();
        Toaster.newToaster().showSuccess(`字体 "${fontNameToDelete}" 已被移除。`);
    }

    /**
     * 初始化设置界面的事件监听
     */
    function initSettingsListeners() {
        const selectElement = document.getElementById('fanhua_font_select');
        const uploadElement = document.getElementById('fanhua_font_upload');

        selectElement.addEventListener('change', (event) => {
            applyFont(event.target.value);
        });

        uploadElement.addEventListener('change', handleFontUpload);
    }

    // --- 初始化 ---

    /**
     * 注入 CSS 样式和字体样式容器
     */
    function injectCssAndStyleBlock() {
        // 注入设置界面的样式
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `${extensionFolderPath}/style.css`;
        document.head.appendChild(link);
        
        // 创建用于动态注入字体规则的 <style> 元素
        fontStyleElement = document.createElement('style');
        fontStyleElement.id = 'fanhua-font-styles';
        document.head.appendChild(fontStyleElement);
    }

    /**
     * 将设置 UI 添加到页面
     */
    async function addSettingsUi() {
        const settingsHtml = await fetch(`${extensionFolderPath}/index.html`).then(res => res.text());
        document.getElementById('extensions_settings').insertAdjacentHTML('beforeend', settingsHtml);
        
        populateFontSelect();
        renderUserFontList();
        initSettingsListeners();
    }
    
    // 扩展主入口
    jQuery(async () => {
        await loadSettings();
        injectCssAndStyleBlock();
        await addSettingsUi();

        // 初始加载时应用已保存的字体
        applyFont(settings.selectedFont);

        console.log('[Fanhua] Extension loaded.');
    });

})();
