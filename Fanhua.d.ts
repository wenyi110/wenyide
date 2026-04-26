// Fanhua.d.ts

/**
 * 定义一个字体的结构
 */
interface FontDefinition {
    /** 字体在 UI 中显示的名称 */
    name: string;
    /** 指向字体文件的 URL 路径 */
    url: string;
}

/**
 * 繁花扩展的设置对象结构
 */
interface FanhuaSettings {
    /** 当前选择的字体名称 */
    selectedFont: string;
    /** 用户上传的字体列表 */
    userFonts: FontDefinition[];
}

// 可以在 window 对象上声明一个全局 API (如果需要)
declare global {
    interface Window {
        fanhua?: {
            // 如果你想从外部调用某些方法，可以在这里声明
        };
    }
}

// 导出空对象以符合模块规范
export {};
