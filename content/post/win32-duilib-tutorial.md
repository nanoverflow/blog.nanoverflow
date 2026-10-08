---
title: Win32 duilib tutorial
date: 2026-10-01
date_precision: month
categories:
  - Example
tags:
  - Markdown
---


# 从 Duilib 读懂 GUI 库设计 —— 写给想造轮子的你

> **本教程的定位**：以你手头这份 `NIM_Duilib_Framework` 源码为"标本"，逐层解剖一个现代 Windows GUI 库的设计。
> **你的目标**：将来自己写一个"更像 Qt 那样"的 GUI 库。
> **你的起点**：对 GUI 开发了解不多 —— 没关系，本教程假定你从零开始，每一个知识点都会讲透，凡是打比方的地方都会展开详解，并告诉你**比喻在哪里失效**。
>
> 📖 阅读约定：
> - 🧠 **打比方 · 详解**：类比讲解，并说明类比与真实机制的对应关系和失效边界。
> - 🔧 **源码索引**：指向本仓库内的具体文件，建议边读教程边开源码对照。
> - ⚖️ **Qt 对照**：把 duilib 的概念映射到 Qt，为将来写"Qt 风格"的库做准备。
> - 📚 **参考资料**：延伸阅读。
> - ✏️ **动手练习**：学完一章后建议动手做的实验。

---

## 目录

- [前言：GUI 库到底在解决什么问题？](#前言)
- [第 1 章 屏幕上的画面是怎么来的：Win32 消息机制速成](#第1章)
- [第 2 章 Duilib 架构地图：一张图看懂分层](#第2章)
- [第 3 章 Window 类：把 Win32 消息"翻译"成控件事件](#第3章)
- [第 4 章 控件树：组合模式是整个库的地基](#第4章)
- [第 5 章 布局系统：先测量，再排列](#第5章)
- [第 6 章 渲染管线：脏矩形、双缓冲与绘制递归](#第6章)
- [第 7 章 用 XML 描述界面：WindowBuilder 与样式系统](#第7章)
- [第 8 章 事件系统：回调、委托与事件冒泡](#第8章)
- [第 9 章 全局资源管理、DPI 与多语言](#第9章)
- [第 10 章 动画系统与虚拟列表](#第10章)
- [第 11 章 线程模型：来自 Chromium 的 base 库](#第11章)
- [第 12 章 Duilib 的短板：想写"Qt 那样的库"，要补哪些课](#第12章)
- [第 13 章 实战路线图：手写一个 mini GUI 库的六个里程碑](#第13章)
- [附录 A 术语表](#附录a)
- [附录 B 总参考资料](#附录b)

---

<a id="前言"></a>
## 前言：GUI 库到底在解决什么问题？

在写任何一行代码之前，先想清楚：操作系统（这里指 Windows）本身已经提供了画窗口、画按钮的 API 了，为什么还需要一个 GUI 库？

因为操作系统提供的是**最底层的积木**：

1. 它给你一个"窗口"（本质是一块屏幕上的内存区域 + 一个整数句柄 HWND）；
2. 它告诉你"用户动了鼠标/键盘"（通过**消息**机制）；
3. 它允许你用 GDI/GDI+ 这样的绘图 API 往窗口里**画像素**。

但直接用这些积木写一个聊天软件，你会发现：

- 画一个按钮要几十行代码，还要自己处理鼠标悬停、按下、禁用三种状态；
- 窗口大小变了，所有东西的位置都要自己重新算；
- 换个分辨率/缩放比例（DPI），界面全花了；
- 100 个列表项的界面，滚动时闪烁得像坏掉的灯管。

**GUI 库的本质，就是在操作系统这层"汇编语言"之上，发明一层"高级语言"**，它至少要回答四个问题：

| 问题 | 答案（几乎所有 GUI 库都这样设计） | duilib 里的实现 | Qt 里的实现 |
|---|---|---|---|
| 界面长什么样？ | **控件树**（一棵对象树描述界面结构） | `Control` / `Box` 组成的树 | `QObject`/`QWidget` 树 |
| 每个东西放哪里？ | **布局系统**（自动计算位置尺寸） | `Layout` / `VBox` / `HBox` | `QLayout` |
| 界面怎么画出来？ | **渲染系统**（把树画成像素） | `IRenderContext` + GDI+ | `QPainter` / Scene Graph |
| 用户操作了怎么办？ | **事件/信号系统**（把输入路由到代码） | `EventArgs` + `Delegate` | 信号槽 + QEvent |

加上两个工程问题：

| 问题 | duilib 的答案 | Qt 的答案 |
|---|---|---|
| 代码和界面分离 | XML 皮肤文件 + `WindowBuilder` | `.ui` 文件 / QML |
| 跨线程操作界面 | base 库的 `MessageLoop` + `PostTask` | `QEventLoop` + `QMetaObject::invokeMethod` |

> 🧠 **打比方 · 详解：GUI 库是"装修公司"**
>
> 把操作系统（Windows）想象成一家**建材市场**：它卖砖头（像素绘图 API）、水管（消息管道）、电闸（窗口句柄），什么都有，但你得自己一块砖一块砖地砌墙。
>
> GUI 库则是**装修公司**：
> - **控件** = 标准化的预制件（门窗、橱柜），你不用自己烧砖；
> - **布局** = 装修图纸上的尺寸标注，告诉工人"这个柜子靠左，剩下的空间给沙发"；
> - **渲染** = 施工队，把图纸变成真实墙面；
> - **事件** = 保修电话系统，业主（用户）按下门铃（鼠标），物业（GUI 库）找到负责的工人（控件）上门处理；
> - **XML 皮肤** = 全屋设计效果图，改效果图不用砸墙重新砌。
>
> **比喻失效的地方**：装修是一次性工程，而 GUI 是**持续进行的**——用户每拖一下窗口，"图纸"就要重新计算一次，"墙"就要重刷一遍。所以 GUI 库真正的难点不在"建"，而在**反复重建依然流畅**。这也是第 5、6 章要花大力气讲布局算法和脏矩形重绘的原因。

本教程的每一章，都会围绕上面这张表格中的一个格子展开。

---

<a id="第1章"></a>
## 第 1 章 屏幕上的画面是怎么来的：Win32 消息机制速成

GUI 库的一切都建立在操作系统的事件机制上。不懂这一章，后面全是空中楼阁。

### 1.1 关键事实：你的程序不主动画屏幕，是系统"叫"你画

Windows 下每个顶层窗口背后都有一个**窗口过程**（Window Procedure，简称 WndProc），它就是一个函数：

```cpp
LRESULT CALLBACK WndProc(HWND hWnd, UINT message, WPARAM wParam, LPARAM lParam);
```

操作系统会在"有事情发生"时调用这个函数，`message` 就是**消息编号**，常见的有：

- `WM_PAINT`：系统说"你的窗口有区域失效了，请重画"；
- `WM_SIZE`：窗口大小变了；
- `WM_MOUSEMOVE` / `WM_LBUTTONDOWN` / `WM_LBUTTONUP`：鼠标移动/按下/抬起；
- `WM_KEYDOWN`：键盘按下；
- `WM_CLOSE` / `WM_DESTROY`：用户点了关闭。

> 🧠 **打比方 · 详解：餐厅服务员模型**
>
> 把你的程序想象成一家餐厅：
> - **消息队列（Message Queue）**：柜台旁的订单单据架。收银员（操作系统）接到客人需求就写一张单子夹上去；
> - **消息循环（Message Loop）**：服务员不停地做的一件事——"从单据架上取一张单子 → 送给对应的厨师 → 回来继续取下一张"，一个 `while` 循环；
> - **窗口过程 WndProc**：厨师。每张单子（消息）都有编号（`WM_XXX`）和附注（`wParam`/`lParam`，比如鼠标坐标），厨师按编号查菜单决定怎么处理；
> - **`WM_PAINT`**：总部通知"你们店橱窗玻璃被人砸了个洞，请补画"——注意，**不是"画一遍"，而是"把破了的那块补上"**，这个"破洞"就是后面要讲的**无效区域（Invalid Rect）**，它是整个 GUI 性能优化中最核心的概念之一。
>
> **比喻失效的地方**：餐厅服务员是并发处理多张单子的，而传统 Windows UI 线程的窗口过程是**严格串行**的——一张消息没处理完，下一张不会被处理。所以 UI 线程里做任何耗时操作（比如同步下载），整个界面都会"卡死"（消息循环转不动了，无法响应 `WM_PAINT`）。这就是"UI 线程不能阻塞"的根本原因，也是第 11 章要讲线程模型的原因。

### 1.2 最小可运行的 Win32 程序长什么样

一个教科书式的骨架（节选自 Microsoft 官方教程 "Learn to Program for Windows in C++"，见参考资料）：

```cpp
int WINAPI wWinMain(HINSTANCE hInstance, HINSTANCE, PWSTR, int nCmdShow) {
    // 1. 注册窗口类：告诉系统"我的窗口长什么样，窗口过程是哪个函数"
    WNDCLASS wc = { ... };
    wc.lpfnWndProc = WndProc;          // 关键！绑定消息处理函数
    RegisterClass(&wc);

    // 2. 创建窗口
    HWND hwnd = CreateWindowEx(0, L"MyClass", L"标题", WS_OVERLAPPEDWINDOW, ...);

    // 3. 显示窗口
    ShowWindow(hwnd, nCmdShow);

    // 4. 消息循环：程序的心跳
    MSG msg = {};
    while (GetMessage(&msg, NULL, 0, 0)) {   // 取消息，队列空则睡眠（不占CPU！）
        TranslateMessage(&msg);              // 翻译键盘消息
        DispatchMessage(&msg);               // 分发给 WndProc
    }
    return 0;
}

LRESULT CALLBACK WndProc(HWND hwnd, UINT message, WPARAM wParam, LPARAM lParam) {
    switch (message) {
    case WM_PAINT: { /* 用 BeginPaint/DrawText/EndPaint 画点东西 */ } break;
    case WM_DESTROY: PostQuitMessage(0); break;  // 发出"退出循环"的消息
    default: return DefWindowProc(hwnd, message, wParam, lParam); // 交给系统默认处理
    }
    return 0;
}
```

注意第 4 步：`GetMessage` 在队列没有消息时会**让线程睡眠**，所以消息循环空转时 CPU 占用是 0%。GUI 程序的一生就是这一个循环，GUI 库的全部工作，都是为了让这个循环里的代码写起来更人性化。

### 1.3 两个决定 GUI 库命运的机制

**（1）无效区域（Invalid Rectangle）与 WM_PAINT 的"懒"**

调用 `InvalidateRect(hwnd, &rc, TRUE)` 只是把一块矩形区域标记为"脏了，需要重画"，**并不会立即重画**。系统把多个失效区域合并，在程序空闲时才发一条 `WM_PAINT`，并且只允许你画"脏了的那块"（通过 `BeginPaint` 返回的 `PAINTSTRUCT.rcPaint`）。这个设计的精髓是：**把"哪里脏了"的记账工作和"重画"的体力活分离，中间能合并就合并**。duilib 和 Qt 的重绘优化全都建立在这之上。

**（2）子窗口 vs 自绘控件**

Win32 原生控件（`BUTTON`、`EDIT`）是真正的"子窗口"——每个按钮有自己的 HWND，系统帮你画。但要做 QQ 那种完全自定义外观的界面，原生控件是死路（样式改不动）。现代做法是：

> **一个顶层窗口（唯一 HWND）+ 所有控件都是"假控件"（纯内存对象，自己画、自己处理鼠标）**

这叫 **DirectUI**（直绘 UI），"duilib"的名字就来自这里（Direct UI library）。代价是：窗体消息（鼠标、键盘）全部要自己路由给"假控件"——这正是第 3、8 章的主题。

> 🧠 **打比方 · 详解：中央厨房 vs 一堆路边摊**
>
> 原生 Win32 控件像**商业街上的一个个路边摊**：每个摊位（HWND）独立经营、自己吆喝（自己的 WndProc）、自己装修（系统样式）。管理成本低（系统全包），但你想把整条街统一装修成"深夜食堂风"（自定义皮肤）？不可能，每个摊主（系统控件类）不听你的。
>
> DirectUI 像一家**中央厨房**：整条街（顶层窗口）只有一个营业执照（一个 HWND），街上看起来有 30 个摊位（控件），其实都是同一个厨房在统一出餐、统一装修、统一收银（一个 WndProc 路由所有消息 + 一次绘制所有控件）。风格想怎么换就怎么换。
>
> **代价**：厨房要自己实现"哪个摊位被客人碰到了"（命中测试）、"摊位收到客人投诉该怎么处理"（事件路由）、"哪个摊位脏了要重新装修"（局部重绘）。这些 duilib 都替你写好了，代码就在你眼前。

### 1.4 本章知识点清单

- [ ] 窗口过程（WndProc）是系统回调你的函数，消息是它的入参
- [ ] 消息循环 = 程序心跳，UI 线程阻塞 = 界面卡死
- [ ] `InvalidateRect` 只记账不干活，`WM_PAINT` 才干活，且只干"脏区"的活
- [ ] DirectUI = 单 HWND + 自绘控件，是所有现代自绘 GUI 库（duilib/Qt Widgets 的自绘部分/Chromium）的共同路线

> 📚 **本章参考资料**
> 1. Microsoft 官方入门教程《Learn to Program for Windows in C++》——第 1~4 讲就是消息机制：
>    https://learn.microsoft.com/windows/win32/learnwin32/learn-to-program-for-windows
> 2. Charles Petzold《Programming Windows》(第5版) —— Win32 GUI 的圣经，前 4 章覆盖本章全部内容。
> 3. MSDN《Painting and Drawing》—— 无效区域与 WM_PAINT 的权威说明：
>    https://learn.microsoft.com/windows/win32/gdi/painting-and-drawing
> 4. 本仓库对应源码：无（duilib 是站在这些机制之上的库），但可以看 `examples/basic/main.cpp` 中的 `wWinMain`，感受一下"GUI 库接管后"的入口长什么样。

✏️ **动手练习**：用第 1.2 节的骨架（不借助任何库）写一个程序：窗口里画一行字，点击鼠标时换一行字。只需要 `WM_PAINT` + `WM_LBUTTONDOWN` 两个 case。写完后你就理解了 GUI 库要帮你省掉的到底是什么。

---

<a id="第2章"></a>
## 第 2 章 Duilib 架构地图：一张图看懂分层

### 2.1 源码目录与职责

```
NIM_Duilib_Framework/
├── base/                ← 平台无关的基础设施（源自 Google Chromium 的 base 库）
│   ├── framework/       ←   MessageLoop 消息循环、消息泵
│   ├── thread/          ←   线程封装、线程管理（UI 线程注册制）
│   ├── memory/          ←   弱引用指针 SupportWeakCallback（非常重要！）
│   ├── callback/        ←   闭包/回调封装
│   └── ...              ←   文件、加密、时间、同步原语
├── duilib/              ← GUI 核心（不依赖 Windows 之外的任何东西）
│   ├── Core/            ← 心脏：Window / Control / Box / WindowBuilder / GlobalManager / Markup
│   ├── Box/             ← 布局容器：HBox / VBox / TileBox / TabBox
│   ├── Control/         ← 具体控件：Button / Label / List / RichEdit / TreeView...
│   ├── Render/          ← 渲染抽象：IRender* 接口 + GDI+ 实现
│   ├── Animation/       ← 动画播放器
│   └── Utils/           ← Delegate(事件委托) / DpiManager / Shadow(窗口阴影) / TimerManager...
├── ui_components/       ← 基于 duilib 封装的业务组件（msgbox、toast、cef 控件）
└── examples/            ← 示例：basic / controls / layouts ...
```

### 2.2 分层架构图

```
┌────────────────────────────────────────────────────────────┐
│  应用层：你的业务代码 + ui_components（msgbox/toast/cef）      │
├────────────────────────────────────────────────────────────┤
│  控件层：Button / Label / RichEdit / List / TreeView ...     │
│  容器层：Box / VBox / HBox / TileBox / TabBox                │
│  核心：  Control ← Box      Window      WindowBuilder        │
│          （控件树）          (HWND桥)     (XML解析)           │
├────────────────────────────────────────────────────────────┤
│  服务：  Delegate(事件)  Layout(布局)  Animation  DpiManager  │
├────────────────────────────────────────────────────────────┤
│  渲染：  IRenderFactory → IRenderContext/IPen/IBrush/IBitmap │
│          ↘ 唯一内置实现：RenderFactory_GdiPlus                │
├────────────────────────────────────────────────────────────┤
│  base：  MessageLoop / ThreadManager / WeakCallback / 闭包    │
├────────────────────────────────────────────────────────────┤
│  操作系统：user32（消息） gdi32+GDI+（绘图） dwm（合成）        │
└────────────────────────────────────────────────────────────┘
```

一次"用户点击按钮"的完整旅程（贯穿全库，后面各章逐段展开）：

```
用户点击
 → OS 把 WM_LBUTTONDOWN 投递到消息队列          (第1章)
 → UI 线程的 MessageLoop 取出消息                (第11章)
 → Window::HandleMessage 收到消息               (第3章)
 → 窗口对控件树做命中测试 FindControl(pt)        (第4章)
 → 找到按钮，调用其 HandleMessageTemplate(kEventMouseButtonUp)
 → 按钮状态切换，触发 OnEvent 里注册的回调        (第8章)
 → 事件如果按钮不处理，沿父链"冒泡"              (第8章)
 → 状态变化调用 Invalidate() 标记脏区            (第6章)
 → 循环空闲时系统发 WM_PAINT → Window::Paint()  (第6章)
 → 从根 Box 开始递归 Paint，每个控件用 IRenderContext 画自己 (第6章)
```

> 🧠 **打比方 · 详解：这套分层像一家医院**
>
> - **base 层 = 医院的水电与行政系统**：病人看不见它，但它停了医院就瘫痪（消息循环停了界面就死了）；
> - **渲染层 = 检验科的标准化验流程**：临床科室（控件）只管开化验单（DrawImage/DrawText），不在乎用的是进口机器（GDI+）还是国产机器（将来你可以接 Direct2D/Skia）——接口 `IRenderContext` 就是**化验申请单的统一格式**；
> - **控件层 = 各科室**：皮肤科（Label）、外科（Button），各管各的病人；
> - **Window = 院长办公室 + 导诊台**：外面来的所有事（消息）都先到导诊台，导诊台决定分给哪个科室（命中测试）；
> - **事件冒泡 = 疑难病例逐级上报**：主治医师（子控件）处理不了，上报科主任（父容器），科主任处理不了上报院长。
>
> **比喻失效的地方**：医院的分诊靠人判断，duilib 的分诊是**纯几何计算**（点在谁的矩形里）；而且"上报"在 duilib 里是**可选择退出的**——回调返回 `false` 就终止，返回 `true` 才继续冒泡，像病历上写"本科室已处理完毕，无需上报"。

### 2.3 Duilib 与 Qt 的概念映射总表（收藏这张表）

| 概念 | duilib (NIM 版) | Qt |
|---|---|---|
| 程序对象 | `nbase::MessageLoop`（无全局对象） | `QApplication` |
| 顶层窗口 | `ui::Window`（包着 HWND） | `QWidget`(top-level) / `QWindow` |
| 控件 | `ui::Control` 及派生 | `QWidget` 及派生 |
| 容器/布局 | `Box` + `Layout`(HBox/VBox...) | `QWidget` + `QLayout` |
| 界面描述 | XML 皮肤 + `WindowBuilder` | `.ui`(XML) / QML / 纯代码 |
| 全局样式 | `global.xml` 的 `class` 属性 | QSS 样式表 |
| 事件 | `EventArgs` + `CEventSource`(回调列表) | `QEvent` + 虚函数 / 信号槽 |
| 信号槽 | 无（用 `std::function` 回调 + 弱引用兜底） | 信号槽（元对象系统支持） |
| 绘图 API | `IRenderContext`（GDI+ 实现） | `QPainter`（多个后端） |
| 渲染后端可换 | `IRenderFactory` 抽象工厂 | QPA 平台插件 / RHI |
| 列表大数据 | `VirtualListBox`（只建可见项） | Model/View (QListView) |
| 定时器 | `TimerManager` / `AnimationPlayer` | `QTimer` |
| 跨线程调用 UI | `ThreadManager::PostTask` | `QMetaObject::invokeMethod` |
| DPI 适配 | `DpiManager`（手动缩放数值） | Qt6 自动高 DPI |
| 国际化 | `MultiLangSupport`(语言 XML) | `tr()` + lupdate/Qt Linguist |

> 📚 **本章参考资料**
> 1. 本仓库 `README.md`（特色功能列表）与 `docs/SUMMARY.md`（官方中文文档目录，控件用法以它为准）。
> 2. duilib 社区版（本项目的前身，接口更接近原始 duilib）：https://github.com/duilib/duilib
> 3. Chromium 设计文档中关于 base 的说明（理解 `base/` 的出处）：https://chromium.googlesource.com/chromium/src/+/refs/heads/main/base/README.md
> 4. Qt 官方架构总览：https://doc.qt.io/qt-6/qtgui-index.html

✏️ **动手练习**：打开 `examples/basic` 编译运行（VS 打开 `examples.sln`，F7）。然后只做一件事：把 `bin/resources/themes/default/basic/basic.xml` 里 `Label` 的 `text` 改掉再运行。体会"**改 XML = 改界面**"——这是第 7 章的伏笔。

---

<a id="第3章"></a>
## 第 3 章 Window 类：把 Win32 消息"翻译"成控件事件

`duilib/Core/Window.h`（约 900 行）是整个库中**唯一**和 HWND 深度绑定的类。它的存在让其他所有类（Control/Box/Layout）都不用知道 Windows API 的存在——这是 GUI 库可移植性的第一块基石。

### 3.1 Window 的双重身份

```cpp
class UILIB_API Window : public virtual nbase::SupportWeakCallback
{
public:
    HWND GetHWND() const;                    // 身份一：HWND 的持有者
    bool RegisterWindowClass();              // 注册窗口类（Win32 概念）
    virtual std::wstring GetWindowClassName() const;
    virtual LRESULT HandleMessage(UINT uMsg, WPARAM wParam, LPARAM lParam); // 身份二：消息分发器
    ...
};
```

1. **对下（操作系统）**：它是普通 Win32 窗口的宿主，持有唯一的 HWND，注册窗口类，接收所有消息；
2. **对上（控件树）**：它持有控件树的根 `m_pRoot`（一个 `Box*`），把每条 Win32 消息翻译成控件世界的事件。

### 3.2 消息分发的核心代码走读

`duilib/Core/Window.cpp` 第 874 行起，`HandleMessage` 是一个大 `switch`。看它如何翻译三类最重要的消息：

```cpp
LRESULT Window::HandleMessage(UINT uMsg, WPARAM wParam, LPARAM lParam)
{
    ...
    switch (uMsg) {
    case WM_PAINT:                        // 系统要求重画 → 触发整棵树的绘制
        Paint();
        handled = true;
        return 0;
    case WM_SIZE:                         // 窗口尺寸变化 → 重新排列控件树
        if (m_pRoot != NULL) m_pRoot->Arrange();
        ...
    case WM_MOUSEMOVE: {
        CPoint pt(...);                   // lParam 里解包出鼠标坐标
        m_pNewHover = FindControl(pt);    // ★ 命中测试：这个点属于哪个控件？
        ...
        m_pNewHover->HandleMessageTemplate(kEventMouseMove, ...); // 翻译成控件事件
        ...
    case WM_LBUTTONDOWN: {
        ...
        pControl->HandleMessageTemplate(kEventMouseButtonDown, ...);
    case WM_MOUSEHOVER:
        m_pEventHover->HandleMessageTemplate(kEventMouseHover, ...);
    ...
```

注意三点：

1. **翻译不是一对一**。Win32 的 `WM_MOUSEMOVE` 被拆成 duilib 的一族事件：`kEventMouseMove / kEventMouseEnter / kEventMouseLeave / kEventMouseHover`。因为 Win32 只告诉你"鼠标动了"，而"进入了一个新控件"（`Enter`）需要库自己对比前后两次命中测试的结果来合成——这类由库合成的语义事件，是每个 GUI 库的标配（Qt 里对应 `QEvent::Enter/Leave/HoverEnter`）。
2. **`FindControl(pt)` 命中测试**：从根容器开始递归询问每个控件"这个点在你的矩形里吗？你能处理鼠标吗？"——实现在 `Control::FindControl`（第 4 章详解）。
3. **`WM_ERASEBKGND` 被直接吞掉**（返回 1 什么都不做）。因为 duilib 用双缓冲整体重绘（第 6 章），系统默认的擦除背景反而是闪烁的元凶。

### 3.3 WindowImplBase：模板方法模式

直接用 `Window` 你需要手写"加载 XML → 设根控件 → 处理关闭"的样板代码。`duilib/Utils/WinImplBase.h` 提供了 `WindowImplBase`，把流程固化，子类只需回答三个问题：

```cpp
class BasicForm : public ui::WindowImplBase {
    std::wstring GetSkinFolder()       override { return L"basic"; }   // 皮肤目录
    std::wstring GetSkinFile()         override { return L"basic.xml"; } // 界面XML
    std::wstring GetWindowClassName() const override { return kClassName; }
    void InitWindow() override;  // WM_CREATE 之后回调，在这里 FindControl 拿控件
};
```

> 🧠 **打比方 · 详解：模板方法 = 麦当劳的作业手册**
>
> `WindowImplBase` 像麦当劳的**标准作业手册（SOP）**：炸薯条的流程（接单→油炸→撒盐→装袋→交付）总部写死，各门店不能改流程，但有三个"填空题"必须自己回答：本地土豆供应商是谁（`GetSkinFolder`）、招牌产品是什么（`GetSkinFile`）、店名（`GetWindowClassName`）。
>
> **模式要点**（设计模式里叫 Template Method）：父类定死**算法骨架**（窗口创建流程），把若干步骤声明为虚函数留给子类填空。GUI 库里到处是这个模式（Qt 的 `paintEvent`/`keyPressEvent` 同理），因为框架的本质就是"**调用你的代码，而不是你调用框架**"（好莱坞原则：别打电话给我们，我们会打给你）。
>
> **比喻失效的地方**：麦当劳门店改流程要总部批准，而 C++ 子类想"改流程"可以直接 `override` 那些非填空虚函数（比如示例中的 `OnClose` 就覆盖了默认关闭行为）。好的 GUI 库会把"可覆盖点"用文档标清楚——这正是你在自己的库里要学习的分类功力：**哪些函数是"填空题"（必须覆盖），哪些是"修改题"（可选覆盖），哪些是"考题本身"（禁止覆盖，final）**。

### 3.4 为什么要 SupportWeakCallback（提前打预防针）

`Window` 和 `Control` 都继承 `nbase::SupportWeakCallback`（`base/memory/`）。它提供弱引用标记 `GetWeakFlag()`。为什么 GUI 对象特别需要弱引用？

> 因为控件树是**互相持有指针的网**（父、子、事件回调里捕获的 this），用裸指针容易悬空，用 `shared_ptr` 又容易循环引用（父持有子，子的事件回调捕获父）。duilib 的方案：**所有权链用裸指针（树形结构，父负责删子），跨对象的"关心"（事件回调）用弱引用校验**——回调触发前先看 `weakflag.expired()`，对象已析构就静默返回。这个模式请务必抄进你的库（Qt 用的是另一套：`QObject` 析构时自动断开所有连接）。

> 📚 **本章参考资料**
> 1. 源码：`duilib/Core/Window.h` / `Window.cpp`（重点 `HandleMessage` 874 行起、`Paint` 1728 行起）；`duilib/Utils/WinImplBase.h`。
> 2. 官方文档《窗口创建流程》：本仓库 `docs/SUMMARY.md` 目录下的窗口相关章节。
> 3. 设计模式 Template Method 讲解（含图解）：https://refactoring.guru/design-patterns/template-method
> 4. Raymond Chen 的博客《The Old New Thing》——理解 Win32 消息的各种"为什么"：https://devblogs.microsoft.com/oldnewthing/

✏️ **动手练习**：在 `Window::HandleMessage` 的 switch 里临时加一个 `case WM_MBUTTONDOWN:`（鼠标中键），调用 `m_pEventClick->HandleMessageTemplate(kEventClick);`，编译运行 basic 示例，用中键点按钮。你就亲手完成了一次"Win32 消息 → 控件事件"的翻译。

---

<a id="第4章"></a>
## 第 4 章 控件树：组合模式是整个库的地基

### 4.1 三层继承体系

duilib 的类层次出乎意料地浅，这正是它的优点：

```
nbase::SupportWeakCallback          ← base 提供：弱引用支持
        ↑
   PlaceHolder  (duilib/Core/Placeholder.h)
   职责：位置 m_rcItem、大小、可见性、父指针 m_pParent
   ——"我只占个地方，别的什么都不知道"
        ↑
   Control      (duilib/Core/Control.h)
   职责：颜色/图片/字体/边框/状态(hover,pressed,disabled)/事件/绘制/FindControl
   ——"叶子节点：一个能画、能响应事件的矩形"
        ↑
   Box          (duilib/Core/Box.h)
   职责：m_items 子控件列表 + Layout 布局对象 + 事件向下递归
   ——"分支节点：一个会排座位的矩形"
        ↑
   VBox/HBox/TileBox/TabBox (duilib/Box/)     Button/Label/List... (duilib/Control/)
```

`Box` 继承 `Control` 意味着：**容器自己也是一个控件**——它有背景色、有边框、能接收事件、能画自己，只是额外多了一项能力：管理一堆孩子。

### 4.2 组合模式（Composite Pattern）详解

这是《设计模式》23 个模式中最适合 GUI 的一个，值得完整讲一遍：

- **意图**：将对象组合成**树形结构**以表示"部分-整体"的层次，使得客户端对**单个对象**和**组合对象**的使用具有**一致性**。
- **关键设计**：让"叶子"（Button）和"容器"（Box）实现**同一个接口**。

duilib 里的一致性接口体现在这些函数上，树上的任何节点都有：

```cpp
virtual void SetPos(UiRect rc);        // 告诉它"你的区域是这里"
virtual void Paint(IRenderContext*, const UiRect& rcPaint);     // 画你自己
virtual void PaintChild(IRenderContext*, const UiRect& rcPaint); // 画你的孩子（Box 才有实现）
virtual CSize EstimateSize(CSize szAvailable);  // 说说你想要多大
virtual Control* FindControl(FINDCONTROLPROC, LPVOID, UINT);    // 配合命中测试/查找
virtual void SetVisible_(bool bVisible);
```

于是所有针对"整棵树"的操作都变成一句递归，比如窗口大小改变后重排：

```cpp
// Window.cpp WM_SIZE 分支
if (m_pRoot != NULL) m_pRoot->Arrange();   // 只对根调用一次
// Arrange 内部：调用自己的 Layout 给 m_items 里每个孩子算位置 → 对每个孩子递归 Arrange()
```

> 🧠 **打比方 · 详解：公司组织架构**
>
> - `PlaceHolder` = **工位牌**：只知道"我占着 3 楼东边 2×2 米"；不知道公司业务；
> - `Control` = **基层员工**：有工位牌的信息，还有自己的技能（画自己、响应点击）、自己的外观（背景色=工牌颜色）；
> - `Box` = **部门经理**：首先他也是员工（有工位、有工牌、能干活），额外要干经理的活——把部门里的工位分配下去（Layout）、传达通知（事件分发）、汇总报表（尺寸计算）；
> - `VBox`/`HBox` = **不同管理风格的经理**：一个是"大家给我排成一列纵队"（垂直堆叠），一个是"横着排"；
> - 对树的统一操作 = **总部发通知**："全员下午 3 点开会"。总部不会给每个员工单独打电话，只需要通知各部经理，经理传给小组长，小组长传给员工——**消息在树上单向传播，每个节点对"通知"的理解是一致的**。
>
> **比喻失效的地方**：公司里员工可以"越级汇报"，但 duilib 的树是**严格的单亲结构**——每个控件只有一个 `m_pParent`。因此控件**不能**同时出现在两个容器里（想复用界面片段，见第 7 章 `ChildBox`/`FillBox`）。另外注意：Qt 的 QWidget 树同样是单亲结构，但 Qt 还有一张独立的 `QObject` 信号槽连接网，可以跨树——这个区别在第 12 章会展开。

### 4.3 FindControl：一个被低估的设计——函数指针式遍历

duilib 的树遍历不是写死的"按名字找"，而是把**判定逻辑作为回调函数**传进去：

```cpp
// typedef Control* (CALLBACK* FINDCONTROLPROC)(Control*, LPVOID);  // Control.h 顶部

// Window 里按名字找控件的实现：先建哈希表，再查
pControl->FindControl(__FindControlFromNameHash, this, UIFIND_ALL);

// 鼠标命中测试时（FindControl(pt) 内部）：
// 用 __FindControlFromPoint：矩形包含该点 + 可见 + 可接收鼠标 才返回
```

`UIFIND_VISIBLE / UIFIND_ENABLED / UIFIND_HITTEST / UIFIND_TOP_FIRST` 这些标志位让**同一个遍历器服务多种场景**：找名字、找命中控件、找最顶层可见控件……

> ⚖️ **Qt 对照**：Qt 提供 `findChild<T*>(name)` 和 `childAt(pt)`，思路相同（树遍历 + 谓词/几何判断），但 API 更现代（模板 + 元对象）。你的库建议直接用 `std::function<bool(Control*)>` 谓词代替函数指针，类型更安全。

### 4.4 用 name 找控件：UI 与逻辑的握手

XML 里给控件起名字：`<Button name="closebtn"/>`，代码里拿它：`FindControl(L"closebtn")`。这一对机制是"界面与逻辑分离"的最后一步握手——界面在 XML 里，逻辑在 C++ 里，`name` 是他们之间唯一的暗号。这和 Android 的 `findViewById`、Qt Designer + `ui->pushButton` 是同一个思想。

> 📚 **本章参考资料**
> 1. 源码：`duilib/Core/Placeholder.h`（看它有多少"位置"职责）、`duilib/Core/Control.h`（`FindControl` 相关与 `UIFIND_*` 宏）、`duilib/Core/Box.h`（`m_items`、`Add/Remove/GetAt`）。
> 2. GoF《设计模式：可复用面向对象软件的基础》Composite 章节（GUI 库与组合模式的出身说明，书里举的例子正是图形与图形容器）。
> 3. Refactoring.Guru 图解组合模式（中文）：https://refactoring.guru/zh-CN/design-patterns/composite
> 4. Qt 对应概念：Qt 对象树与所有权：https://doc.qt.io/qt-6/objecttrees.html

✏️ **动手练习**：在 basic 示例的 `InitWindow()` 里写下：
```cpp
auto btn = dynamic_cast<ui::Button*>(FindControl(L"closebtn"));
ASSERT(btn != nullptr);
```
然后打印 `btn->GetParent()->GetParent()` 的类名，亲手把 basic.xml 的树在脑子里画一遍（Window → VBox → HBox → Button）。

---

<a id="第5章"></a>
## 第 5 章 布局系统：先测量，再排列

布局是 GUI 库里**算法含量最高**的部分。duilib 的布局系统与 Web 的 Flexbox、Android 的 LinearLayout、Qt 的 QLayout 在思想上高度一致，学会了它，你对那几家也触类旁通。

### 5.1 问题的本质：空间不够分，怎么分？

窗口可大可小，控件想大想小，冲突时听谁的？所有布局系统都归结为两问：

1. **测量（Measure）**：给我这么多可用空间，你需要多大？（ duilib：`EstimateSize(szAvailable)`；Qt：`sizeHint()`；Web：flex-basis/auto）
2. **排列（Arrange）**：最终决定你多大、在哪。（duilib：`SetPos(rc)`；Qt：`setGeometry()`；Web：浏览器排版）

**这两步必须分开**。想象你排一排三个按钮，若直接定位置，第一个按钮变大后你不知道第三个该不该挪；只有先问完所有人"你想要多大"，才知道总需求和剩余空间，才能决定"谁伸缩、谁挤出去"。

> 🧠 **打比方 · 详解：地铁车厢排座位**
>
> 布局管理器是**地铁车厢的乘务员**，车厢宽度是窗口宽度，乘客是控件：
> - **测量阶段**：乘务员挨个问："你坐下来占多宽？"（`EstimateSize`）。有人回答"固定 60cm"（`width="60"`），有人回答"看身材"（`width="auto"`），有人回答"随便，给我剩下的都行"（`width="stretch"`）。注意**这时候谁都没坐下去**，乘务员只是在做加法；
> - **分配阶段**：加总后乘务员发现超员了，按规则压缩：先压缩"随便"的（stretch 有最小宽度约束就缩它），再压缩"看身材"的（auto 可以到 min 尺寸），固定宽度的**绝不压缩**；
> - **排列阶段**：乘务员按最终结果喊"你，0~60cm；你，60~160cm……"，每人拿到自己的座位区间（`SetPos`）。
>
> **比喻失效的地方**：地铁只有一维（一排），而布局是**二维递归**的：VBox 里嵌 HBox，每个 HBox 又是一节小车厢，自己还要向上一节车厢汇报"我需要多高"。真实的布局是一棵**自底向上汇总需求、自顶向下分配空间**的双重树遍历——这也解释了为什么复杂布局有性能成本，第 10 章的虚拟列表正是为了砍掉这个成本。

### 5.2 duilib 布局类的结构：布局策略与容器分离

duilib 有个精妙设计：**布局算法不是 Box 的虚函数，而是独立的 `Layout` 对象**（`Box` 构造时持有一个 `Layout*`）：

```cpp
class UILIB_API Box : public Control {
    Box(Layout* pLayout = new Layout());   // 组合而非继承！
    virtual void SetPos(UiRect rc) override {
        ...
        m_pLayout->ArrangeChild(m_items, rc);   // Box.cpp 248 行：委托给布局对象
    }
};

// 布局家族（duilib/Core/Box.h + duilib/Box/）
Layout      → 绝对定位/浮动布局（相当于 position:absolute 或不设 layout 的 Canvas）
HLayout     → 水平依次排列
VLayout     → 垂直依次排列
HTileLayout/VTileLayout → 网格平铺（flexbox 的 wrap）
```

HBox、VBox 这些类只是"构造时传入对应 Layout"的语法糖。**策略模式**（Strategy）：同一容器可以热插拔排座策略，XML 里甚至可以 `<Box>` 内写子布局标签混用。

> ⚖️ **Qt 对照**：Qt 走了继承路线（`QLayout`→`QHBoxLayout`/`QVBoxLayout`），且 Layout 挂在 QWidget 上而不是反过来。两种设计各有道理：duilib 的组合式让"容器"和"策略"正交（一个 Box 换 Layout 不用换类），Qt 的继承式让类型系统帮你保证不出错。你写库时二选一即可，但**必须把"容器"和"算法"分开思考**。

### 5.3 关键属性：XML 里的尺寸语言

看本仓库 `bin/resources/themes/default/basic/basic.xml`：

```xml
<Window size="800,600" caption="0,0,0,35">
  <VBox bkcolor="bk_wnd_darkcolor">
    <HBox width="stretch" height="35" bkcolor="bk_wnd_lightcolor">  <!-- 标题栏 -->
      <Control />                                                <!-- 弹簧：占位空控件 -->
      <Button class="btn_wnd_min" name="minbtn" margin="4,6,0,0"/>
      ...
    </HBox>
    <Box>
      <VBox valign="center" halign="center" width="auto" height="auto">
        <Label name="tooltip" text="一个简单窗口，带有标题栏和常规按钮。"/>
      </VBox>
    </Box>
  </VBox>
</Window>
```

尺寸语法（`Define.h` 里的长度类型）：

- `width="60"`：固定像素（实际会乘 DPI 缩放系数，见第 9 章）；
- `width="stretch"`：占满剩余空间（flex-grow:1），可带权重；
- `width="auto"`：由内容决定（Label 由文字宽度决定）；
- `margin="4,6,0,0"`：外边距（上右下左或逗号简写），布局计算时**从可用空间里先扣掉**；
- 内边距 `inset/padding` 由容器的 Layout 处理，先扣 padding 再分给子项——和 CSS 盒模型一致。

还有控件级 `valign/halign`（在自己那格里的对齐）与 `float`（脱离布局流，绝对定位，等价 CSS `position:absolute`，`Layout::SetFloatPos` 处理）。

### 5.4 源码走读：Box::SetPos 的两阶段

```cpp
// duilib/Core/Box.cpp（节选、注释为笔者所加）
void Box::SetPos(UiRect rc)
{
    Control::SetPos(rc);                       // 1. 先记下自己的区域
    ...
    rc.left += m_pLayout->GetPadding().left;   // 2. 扣掉自己的内边距 → 得到"可用区"
    ...
    requiredSize = m_pLayout->ArrangeChild(m_items, rc);  // 3. 委托布局对象分配孩子
}

// duilib/Core/Box.cpp 113 行：最基础的（浮动）布局
CSize Layout::ArrangeChild(const std::vector<Control*>& items, UiRect rc)
{
    for (auto it = items.begin(); it != items.end(); it++) {
        Control* pControl = *it;
        if (!pControl->IsVisible()) continue;           // 隐藏的控件不占地方
        CSize new_size = SetFloatPos(pControl, rc);     // 每个孩子算出自己的最终位置
        ...
    }
}

// 测量：Box 的 EstimateSize 会汇总孩子（Box.cpp/Box.h）
// AjustSizeByChild：对每个孩子 EstimateSize，再叠 margin，取最大值 —— 典型的自底向上汇总
```

而测量在 `Control::EstimateSize` 中有文本自适应的细节（`EstimateText`，Control.h 509~516 行）：Label 的 `auto` 宽度需要真实测量文字像素宽度（GDI+ `MeasureString`），这解释了为什么 `auto` 布局比固定布局慢。

### 5.5 布局的触发时机：谁"叫醒"乘务员？

- `Window::HandleMessage` 收到 `WM_SIZE` → `m_pRoot->Arrange()`（Window.cpp 949 行附近）；
- 控件动态 `SetVisible(false)` / `SetText` 导致内容变化 → 相关 Box 标记需要重排（duilib 用 `m_bIsArranged` 等标志），下一次 `WM_PAINT` 前统一重排（Window::Paint 1737~1747 行：根容器是 auto 尺寸时还要反推窗口大小 `MoveWindow`——这就是"内容决定窗口大小"）。

> 🧠 **打比方**：乘务员不会乘客一上车就重排，而是**攒一波**（本帧内所有变化），开车前（绘制前）统一排一次。这个"攒起来再统一算"的思想叫**批处理/合并（coalescing）**，动画系统（第 10 章）也靠它。

> 📚 **本章参考资料**
> 1. 源码：`duilib/Core/Box.h/.cpp`（`Layout::ArrangeChild`、`AjustSizeByChild`）、`duilib/Box/HBox.cpp`、`VBox.cpp`、`TileBox.cpp`；XML 属性完整清单见本仓库 `docs/SUMMARY.md`。
> 2. CSS Flexbox 交互教程（布局思想同源，强烈推荐玩一遍）：https://flexboxfroggy.com/#zh-cn
> 3. Qt 布局系统文档：https://doc.qt.io/qt-6/layout.html
> 4. Android LinearLayout（同思想第三例）：https://developer.android.com/develop/ui/views/layout/linear
> 5. 深入版：Chromium 的 FlexBox/NG 布局设计文档（想造性能级布局引擎必读）：https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/core/layout/README.md

✏️ **动手练习**：把 basic.xml 的标题栏 HBox 里那个 `<Control />` 弹簧删掉运行，观察三个按钮挤到左边；再给 closebtn 加 `width="stretch"` 观察它独占剩余空间。用极小的实验体会 stretch/auto 的语义。

---

<a id="第6章"></a>
## 第 6 章 渲染管线：脏矩形、双缓冲与绘制递归

这一章回答"控件树如何变成像素"。duilib 的渲染层有四个关键词：**接口抽象、立即模式、双缓冲、脏矩形**。

### 6.1 渲染后端抽象：IRenderFactory + IRender*

`duilib/Render/IRender.h` 定义了一整套**纯虚接口**：

```cpp
class UILIB_API IBitmap  { /* 一块像素内存：GetBits/GetWidth/ClearAlpha... */ };
class UILIB_API IPen     { /* 画笔：颜色/宽度/线帽/虚线样式 */ };
class UILIB_API IBrush   { /* 画刷：纯色或位图 */ };
class UILIB_API IPath    { /* 矢量路径：AddLine/AddRect/AddArc */ };
class UILIB_API IMatrix  { /* 2D 变换矩阵 */ };
class UILIB_API IRenderContext {  // ★ 画板：所有绘制的入口
    virtual void DrawImage(...);   virtual void DrawColor(...);
    virtual void DrawLine(...);    virtual void DrawRect(...);
    virtual void DrawText(...);
    virtual void SetClip(const UiRect& rc);  virtual void ClearClip();
    virtual void Save();  virtual void Restore();
    ...
};

class UILIB_API IRenderFactory {      // 抽象工厂：一揽子创建上述对象
    virtual IPen* CreatePen(...) = 0;
    virtual IRenderContext* CreateRenderContext() = 0;
    ...
};
```

唯一内置实现是 `RenderFactory_GdiPlus`（`duilib/Render/Factory.h`）：用 Windows GDI+ 实现 IRenderContext。而全局入口在 `GlobalManager::GetRenderFactory()`——**上层代码（控件）只碰 I 接口，永远不知道背后是 GDI+ 还是 Direct2D**。这是两个经典模式的组合：**抽象工厂**（创建一族相关对象）+ **桥接**（抽象的控件绘制与具体的图形 API 分离）。

> ⚖️ **Qt 对照**：`QPainter` 同样是多后端（光栅/OpenGL），Qt6 的 RHI 更是把"3D 后端抽象"做成了独立层。**GUI 库的长寿秘诀之一就是渲染后端可替换**：GDI+ 会老，D2D/Skia 会来，接口抽象让你不重写控件就能换引擎。官方新版 duilib 已加入 Direct2D 等后端，验证了这个设计的价值。

### 6.2 一次完整的绘制：Window::Paint 走读

`Window.cpp` 1728 行起：

```cpp
void Window::Paint()
{
    ...
    // 1. 若根容器是自适应尺寸且需要重排，先测量并 MoveWindow 调整窗口本身
    if (m_bIsArranged && m_pRoot->IsArranged() && ...) {
        CSize needSize = m_pRoot->EstimateSize(maxSize);   // 测量（第5章）
        ...
        ::MoveWindow(m_hWnd, ..., needSize.cx, needSize.cy, TRUE);
    }
    // 2. 问系统：这次要重画的"脏区"是哪一块？没脏区就什么都不画
    UiRect rcPaint;
    if (!::GetUpdateRect(m_hWnd, &rcPaint, FALSE) && !m_bFirstLayout) return;
    ...
    // 3. 建画板（双缓冲的内存画板）→ 递归绘制整棵树（但每层知道只画与脏区相交的部分）
    // 4. 一次性把内存画板 BitBlt 到屏幕
}
```

### 6.3 双缓冲（Double Buffering）

如果每个控件直接往屏幕 DC 上画，树上有 100 个控件就有一百次可见的"逐个出现"，肉眼能看到闪烁。duilib 的做法：

1. 在内存里创建一块和客户区等大的位图（`IRenderContext::Resize` 创建的后备位图）；
2. 所有控件递归画到**内存位图**上（再脏也不影响屏幕）；
3. 全画完后用一次 `BitBlt`（或带 alpha 的 `UpdateLayeredWindow`）整块搬到屏幕。

> 🧠 **打比方 · 详解：画家的草稿纸**
>
> 直接往屏幕画 = 画家在**画展的墙上**直接作画，观众全程围观你从线稿到上色，中间态非常难看（闪烁）；双缓冲 = 画家在**画架上垫一张草稿纸**（内存位图），画到完美才把整张揭下来贴上墙（BitBlt）——观众永远只看到成品。
>
> **比喻失效的地方**：画展贴画要人爬梯子很慢，而内存位图到屏幕的 BitBlt 是一次内存拷贝，很快。**真正的成本在"重画整张草稿纸"**——明明只有一个小按钮变了，却要把 100 个控件全部重画一遍？这就是脏矩形优化要解决的问题：`Window::Paint` 把 `rcPaint` 一路传给每个 `Control::Paint(pRender, rcPaint)`，每个控件先判断自己的区域和脏区是否相交（`GetRect().IsIntersect(rcPaint)`），不相交直接跳过绘制。于是"重画"被限制在脏区附近的那几层控件。

### 6.4 控件的绘制：模板方法又来了

每个控件画自己的固定套路在 `Control::Paint`（Control.h 873~877 行声明，顺序即层级）：

```cpp
virtual void PaintBkColor(IRenderContext*);      // 1 背景色
virtual void PaintBkImage(IRenderContext*);      // 2 背景图
virtual void PaintStatusColor(IRenderContext*);  // 3 状态色（hover/pressed...）
virtual void PaintStatusImage(IRenderContext*);  // 4 状态图
virtual void PaintText(IRenderContext*);         // 5 文字
virtual void PaintBorder(IRenderContext*);       // 6 边框（最上层）
```

想自定义画法？覆盖其中一步即可（比如圆形头像只覆盖 `PaintBkImage` 做圆形裁剪）。这就是 `BeginPaint→画6层→EndPaint` 的固定仪式感，Qt 的 `paintEvent` 是同样的"一次回调画全部"的简化版。

**裁剪（Clip）**：`PaintChild` 前用 `AutoClip`（RAII 风格，构造时 `SetClip`，析构时 `ClearClip`）保证孩子画不出容器的圆角/边界——相当于给草稿纸按容器形状挖了个洞再刷漆。RAII 的意义：就算中间抛异常，裁剪也必然恢复（Qt 里对应 `QPainter::setClipRect` + 析构恢复，原理相同）。

### 6.5 立即模式 vs 保留模式——决定你的库像 Qt Widgets 还是 Qt Quick

- **立即模式（Immediate Mode）**：duilib、Qt Widgets。系统只记住"控件树 + 属性"，每次重绘从头按序画。简单可靠，但复杂动画/大规模图形时 CPU 重绘开销大。
- **保留模式（Retained Mode）**：浏览器、Qt Quick（Scene Graph）、Flutter（Layer Tree）。每次绘制产生的是**图形指令记录（display list / 渲染树）**，GPU 增量合成，只有变化的层才重绘，动画时只是在 GPU 上变换已缓存的纹理（60fps 轻松）。

> 🧠 **打比方**：立即模式 = 每次客人点单，厨师**从切菜开始**现做一整桌；保留模式 = 餐厅把常用菜**预制好放冷柜**（缓存的纹理/图元列表），点单时只需组装和加热。现做控制成本低（duilib 全库不到几万行就能实现），预制设备贵但出餐快（Qt Quick 需要 GPU 管线 + Scene Graph 这套重装备）。
>
> 你第一个库建议从立即模式起步（好实现、好调试），但在架构上**把"控件的绘制"和"绘制的执行"分离开**（比如 `Control::Paint` 只调用 `IRenderContext`），将来想升级保留模式，换 `IRenderContext` 的实现语义即可——duilib 的接口设计已经给你留了这条路。

> 📚 **本章参考资料**
> 1. 源码：`duilib/Render/IRender.h`（接口全家福）、`Render.h/.cpp`（GDI+ 实现，看 `RenderContext_GdiPlus::DrawImage` 如何处理九宫格拉伸）、`Factory.h`、`Window.cpp::Paint`（1728）、`Control.cpp::Paint`（搜 `PaintBkColor`）。
> 2. MSDN 双缓冲官方范例：https://learn.microsoft.com/windows/win32/direct2d/direct2d-quickstart （D2D 快速入门，思想相同）
> 3. Qt Quick Scene Graph（保留模式参照物）：https://doc.qt.io/qt-6/qtquick-visual-scenegraph.html
> 4. Flutter 架构总览（现代保留模式渲染管线，图文极佳）：https://docs.flutter.dev/resources/architectural-overview
> 5. 九宫格/圆角图片绘制原理（duilib `DrawImage` 的 `rcCorners` 参数）：搜索 "9-slice scaling"，参考 https://en.wikipedia.org/wiki/9-slice_scaling

✏️ **动手练习**：给 `Control::Paint` 的第一行加一句 `OutputDebugString` 打印控件名与脏区，运行 basic 示例并点击按钮，观察"点击 → 只有哪些控件重画了"。再故意把 `WM_ERASEBKGND` 分支注释掉（交给系统擦背景），对比闪烁程度。

---

<a id="第7章"></a>
## 第 7 章 用 XML 描述界面：WindowBuilder 与样式系统

duilib 最有辨识度的设计：**界面不是代码写出来的，是 XML 描述出来的**。这一章讲清三件事：解析、实例化、样式复用。

### 7.1 全流程：从 XML 文件到控件树

```
basic.xml（磁盘/zip包）
  → CMarkup 解析成 XML 树（duilib/Core/Markup.h，来自 firstobject 的轻量 XML 库）
  → WindowBuilder::Create() 开始遍历
     → 对每个节点：CreateControlByClass(节点名)  —— "反射"造控件
     → SetAttribute(属性名, 属性值) 逐个应用属性
     → AttachXmlEvent：把 XML 里写的 event 绑上回调
     → 递归子节点，Add 到父 Box
  → 返回根 Box，交给 Window::AttachDialog 挂到窗口上
```

关键代码（`duilib/Core/WindowBuilder.cpp`）：

```cpp
Control* WindowBuilder::_Parse(CMarkupNode* parent, Control* pParent, Window* pManager)
{
    for (CMarkupNode node = parent->GetChild(); node.IsValid(); node = node.GetSibling()) {
        // 1. 节点名 → 控件类
        Control* pControl = CreateControlByClass(node.GetName());
        //    内部：GlobalManager::CreateControl(L"Button") —— 一张大字符串→工厂函数映射表
        // 2. 应用 XML 属性：class/width/margin/bkcolor/text...
        for (CMarkupNode::MapAttributesIterator it = ...; attribute valid; ++it)
            pControl->SetAttribute(strName, strValue);
        // 3. 递归子节点并挂接事件
        _Parse(&node, pControl, pManager);
        ...
    }
}
```

`CreateControlByClass` 是**伪反射**：C++ 没有运行时反射，duilib 维护了一张 `类名 → 创建函数` 的静态映射表（官方文档中要求注册自定义控件时提供回调），`WindowBuilder` 构造时传入的 `CreateControlCallback` 也在这时生效——所以 CEF 控件这类"外部控件"能被注入进来。**你的库可以做得更好**：宏注册表或代码生成，但"字符串类名 → 工厂函数"的机制本身是不变的。

> 🧠 **打比方 · 详解：装修图纸与施工队**
>
> XML = **装修图纸**（哪里放门、哪里放窗，只有数据没有工艺）；
> `CMarkup` = **审图的文员**，把图纸读成结构化记录；
> `CreateControlByClass` = **施工队的零件仓库**，听到图纸写"_button_"就从货架上取一个标准门框（控件构造函数）；
> `SetAttribute` = **工人按图纸标注施工**（"门宽 90cm"→ `SetWidth`，"门漆米白"→ `SetBkColor`）；
> `CreateControlCallback` = **业主自购的特殊家具**（标准仓库没有的，业主自己带来装上——比如 CEF 浏览器控件）；
> `Window::AttachDialog` = **竣工验收、通水通电**（挂到 HWND 上，开始接收消息）。
>
> **比喻失效的地方**：装修图纸一旦施工就定型，而 XML 造出的控件树是**活的**——运行中可以 `Add`/`Remove` 控件、改属性、甚至用 `GlobalManager::FillBox` 在运行时把另一段 XML"填"进某个容器（动态换肤/动态弹窗全靠它，见 `GlobalManager.h` 357~383 行 `CreateBox/FillBox` 系列）。**XML 是初始图纸，不是终身契约**。

### 7.2 样式系统：global.xml 与 class

看本仓库 `bin/resources/themes/default/global.xml`：

```xml
<Global>
    <Font id="system_12" name="system" size="12" default="true"/>
    <TextColor name="green" value="#ff00bb96"/>
    <!-- 还有大量 class 定义（约百余行），例如： -->
    <class name="btn_wnd_close" value="width=&quot;21&quot; height=&quot;21&quot; foreimage=&quot;file='icon_close.png' ... &quot;"/>
</Global>
```

控件 XML 里 `class="btn_wnd_min"` 的含义：**把全局 class 里预置的一串属性先应用，再应用本节点属性**（本地属性覆盖 class 属性）。这就是 CSS 的 `class` + Android 的 `style` 的思想：**外观与语义分离**——"关闭按钮"长什么样改一处全局生效，100 个窗口不用动。`GlobalManager::LoadGlobalResource` 在 `Startup` 时把这些 class 装进 `m_mGlobalClass` 哈希表（GlobalManager.h 434、455 行）。

> ⚖️ **Qt 对照**：等价物是 **QSS**（`button { background: red; }`）与 Qt Quick 的 `QQuickStyle`。QSS 走的是 CSS 选择器路线（能按层级/状态选择），表达力比 duilib 的扁平 class 强；但 class 方案实现只要几十行（字符串展开），**学习成本与解析成本都低一个数量级**。第一版库建议学 duilib（扁平 class），第二版再考虑选择器。

### 7.3 界面复用的三个段位

1. **class**：复用"外观属性"（一颗按钮的皮肤）；
2. **ChildBox / GlobalManager::FillBox**：复用"一段界面"（XML 片段嵌入，如统一的标题栏）；见 `duilib/Box/ChildBox.h`；
3. **自定义 Box 子类**：复用"界面+逻辑"（把标题栏封装成 `TitleBarBox` 类，自带三个按钮的事件处理）。业务代码里的弹窗组件（`ui_components/msgbox`）就是这么封装的。

> 📚 **本章参考资料**
> 1. 源码：`duilib/Core/WindowBuilder.h/.cpp`、`duilib/Core/Markup.h`、`bin/resources/themes/default/global.xml` 与任一皮肤 XML。
> 2. 官方 XML 属性手册（属性名速查）：本仓库 `docs/SUMMARY.md`。
> 3. Android LayoutInflater（同思想）：https://developer.android.com/reference/android/view/LayoutInflater
> 4. Qt 的 .ui 机制（XML→代码生成）：https://doc.qt.io/qt-6/designer-using-a-ui-file.html

✏️ **动手练习**：在 global.xml 里加一个 `<class name="my_red_btn" value="bkcolor=\"red\" forecolor=\"white\""/>`（注意 value 里的引号转义），然后在 basic.xml 的 Label 上加 `class="my_red_btn"`。故意写错一个属性名（如 `bkcolorx`），观察 duilib 如何报错（`GetLastErrorMessage`）——**健壮的解析报错信息**（文件/行号/原因）是你自己写库时最容易忽略的体验细节。

---

<a id="第8章"></a>
## 第 8 章 事件系统：回调、委托与事件冒泡

### 8.1 最小事件系统：Delegate.h 全文精读

duilib 的事件系统核心只有一个头文件（`duilib/Utils/Delegate.h`），全文不到 40 行，值得逐行理解：

```cpp
typedef std::function<bool(ui::EventArgs*)> EventCallback;   // 回调签名：返回 bool！

class CEventSource : public std::vector<EventCallback>       // 一个事件 = 一组回调
{
public:
    CEventSource& operator += (const EventCallback& item) {  // 订阅语法糖
        push_back(item);  return *this;
    }
    bool operator() (ui::EventArgs* param) const {           // 触发：依次调用
        for (auto it = begin(); it != end(); it++) {
            if (!(*it)(param)) return false;   // ★ 某个回调返回 false → 中断！
        }
        return true;
    }
};
typedef std::map<EventType, CEventSource> EventMap;          // 事件类型 → 回调列表
```

每个 `Control` 有两张表（Control.cpp 构造函数里初始化）：

- `OnEvent`：**代码里**注册的回调（`btn->AttachClick(...)`）；
- `OnXmlEvent`：**XML 里**声明的回调（`attachedclick="OnClose"`，需要窗口实现查找函数）。

事件参数 `EventArgs`（`Define.h`）：`pSender`（谁发出的）、`Type`（什么事件）、`ptMouse`、`chKey`、`wParam/lParam`、`dwTimestamp`——注意它**不带控件数据**，业务方用 `SetUserDataID`/`SetTag` 把自己的数据挂在控件上（对照 Qt 的 `sender()` + 自定义属性）。

> 🧠 **打比方 · 详解：门铃与访客登记簿**
>
> `CEventSource` 是按钮上的**门铃**：按门铃（事件触发）时，登记簿上所有登记过的人（回调列表）都会被通知。`+=` 就是往登记簿上添一行。**返回 false 的语义**：第一个被通知的人说"这单我接了，别再通知后面的人"——像公司前台处理完快递就不再转交老板。这个"可中断的广播"是事件系统的灵魂，它让**一个事件只被一个消费者处理**成为可能（比如列表项的 click 被内嵌的删除按钮"抢走"）。
>
> **比喻失效的地方**：真实门铃响了必然有人听到，而这里的回调可能在对象已销毁时被触发——duilib 的防线是第 3 章提过的弱引用：回调执行前后检查 `GetWeakFlag()`（Control.cpp `HandleMessageTemplate` 740 行附近多次检查 `weakflag.expired()`）。**事件系统 = 回调列表 + 生命周期防护**，缺一不可；Qt 用信号槽的**连接自动断开**解决同一问题（对象销毁 → disconnect）。

### 8.2 事件流转全景：从 Win32 到你的 lambda

以一次鼠标左键按下为例（结合第 3、4 章内容串起来）：

```
WM_LBUTTONDOWN
 → Window::HandleMessage 解包坐标，FindControl(pt) 命中测试
 → 命中 Button：button->HandleMessageTemplate(kEventMouseButtonDown, ...)
    → 构造 EventArgs{pSender=this, Type=kEventMouseButtonDown, ptMouse=...}
    → 查 OnEvent[type]  → 有回调？依次执行（可中断）
    → 查 OnEvent[kEventAll] → 同上（万能监听器）
    → 查 OnXmlEvent[...]   → XML 声明的回调
    → 都没人"吃掉" → Control::HandleMessage(msg)
        → 鼠标类事件若本控件不处理/不允许鼠标 → 上交父亲：m_pParent->HandleMessageTemplate(msg)
        → ……一路到根。（事件冒泡）
 → 松开鼠标 WM_LBUTTONUP → 合成出 kEventClick → 触发 AttachClick 注册的回调
```

**冒泡**（Bubbling）的完整定义：事件先给最内层（最具体的）控件，未处理则逐层上交给祖先，直到有人处理或到达根。Web DOM、Android、Qt Quick 都内置了这个机制（Web 里还有反向的"捕获"阶段，duilib 没有）。duilib 的实现非常直白——就是上面那段**递归调用父类的 HandleMessageTemplate**（Control.cpp 780、856 行）。

> 🧠 **打比方**：冒泡 = **信访制度**。村民（按钮）先自己调解；调解不了上交村委会（父 Box）；再不行上交镇政府（窗口）……`return false` = 村民说"这事儿我处理完了"，上报到此为止。**为什么需要它**：容器级交互（比如点击列表项任意空白处选中整行）不需要每个子控件都写代码，在列表项容器上挂一个回调就能收到所有子孙未处理完的点击。

### 8.3 常用事件速查（Define.h，建议通读一遍）

`kEventMouseEnter/Leave/Hover/Move/Down/Up/DoubleClick/Menu/ScrollWheel`、`kEventKeyDown/KeyUp/Char`、`kEventSetFocus/KillFocus/TabStop`、`kEventWindowSize/WindowClose`、`kEventClick`（Down+Up 合成）、`kEventAll`（万能监听）。

> ⚖️ **Qt 对照与选型建议**：duilib 的 `std::function` 回调 ≈ Qt 信号槽的"简化版"。Qt 信号槽的优势：① 信号-信号可以转发形成链；② 元对象系统能在运行时按名字连接（QML 的基础）；③ 自动断连。duilib 用**弱引用**补了第③点。**你的库如果想要"Qt 那样"的体验，强烈建议实现一个极简信号槽**（第 13 章里程碑 M5），这是 Qt 开发者体验的灵魂。

> 📚 **本章参考资料**
> 1. 源码：`duilib/Utils/Delegate.h`（全文）、`duilib/Core/Define.h`（EventArgs/EventType）、`Control.cpp::HandleMessageTemplate`（705~786）、`Window.cpp` 的鼠标分支（1007~1110）。
> 2. DOM 事件冒泡权威解释（MDN 中文，机制与 duilib 完全同构）：https://developer.mozilla.org/zh-CN/docs/Learn/JavaScript/Building_blocks/Events#事件冒泡
> 3. Qt 信号槽官方文档：https://doc.qt.io/qt-6/signalsandslots.html ；Qt 事件系统：https://doc.qt.io/qt-6/eventsandfilters.html

✏️ **动手练习**：给 basic 的外层 VBox `AttachClick` 一个回调打印 "box got click"，再给关闭按钮 `AttachClick` 打印 "btn got click" 并 `return false`/`return true` 各试一次，观察冒泡中断的差异。

---

<a id="第9章"></a>
## 第 9 章 全局资源管理、DPI 与多语言

### 9.1 GlobalManager：库的"总务处"

`duilib/Core/GlobalManager.h`（约 470 行）是全库唯一的全局单例聚合点，管理：

- **渲染工厂**：`m_renderFactory`（第 6 章）；
- **字体缓存**：`GetFont/GetFontInfo`——HFONT 创建昂贵，按 `id` 缓存；
- **图片缓存**：`GetImage(bitmap)` 返回 `shared_ptr<ImageInfo>`（182 行），`m_mImageHash` 按"文件名+参数"去重加载，**同一个 PNG 十个控件用只加载一次**；还带 `LoadImageCache/UnLoadImageCache/ClearImageCache` 生命周期（内存紧张时释放）；
- **颜色表/全局 class/默认样式**：`m_mapTextColor`、`m_mGlobalClass`；
- **资源包**：`OpenResZip` —— 皮肤可以是 zip，`GetData(path)` 统一"从磁盘或 zip 读字节"；
- **XML 构建缓存**：`m_builderMap` —— 同一 XML 反复创建窗口时不必重复解析（`CreateBoxWithCache`）。

> ⚠️ **设计点评**：全局单例是 duilib 简化开发的选择，但也带代价——多窗口应用共享一个图片缓存（好），但全局状态难以测试与多实例化（坏）。Qt 的对应物 `QGuiApplication` 同样是单例，但资源归各对象管理。**你的库建议**：保留"进程级资源缓存"，但把它设计成可注入的对象（如 `ResourceManager`），而不是一堆 static。

### 9.2 DPI 适配：为什么你的界面在高分屏上会"小成蚂蚁"

Windows 的 DPI 逻辑：系统给每个显示器/进程一个缩放比（100%、125%、150%…），程序若声明 "DPI aware"，就必须**自己把所有坐标乘上缩放比**。duilib 的答案在 `duilib/Utils/DpiManager.h`：

- `Window` 创建时获取窗口所在显示器的 DPI → `DpiManager` 存下缩放系数；
- XML 里所有数值（`width="60"`）在 `SetAttribute` 时统一换算成物理像素；
- 图片按 scale 请求高清版本；窗口拖到另一个不同 DPI 的显示器时重算重排。

> 🧠 **打比方**：DPI 缩放像**一张地图的两种比例尺**——XML 里写的是"图上距离"（逻辑像素），`DpiManager` 是换算器，负责按当前比例尺换算成"实际距离"（物理像素）。地图（窗口）从 1:100 换到 1:50 的地区，图上 1cm 对应的实际长度变了，但**图上标注不用改**。

> ⚖️ **Qt 对照**：Qt6 做到了全库自动（绘制坐标统一逻辑坐标，QPA 层处理换算），开发者几乎无感。这是"Qt 更像现代框架"的重要一环，你的库值得把 DPI 作为**第 0 天的架构决策**而不是补丁——所有坐标从第一天就定义为逻辑坐标。

### 9.3 多语言：MultiLangSupport

`duilib/Utils/MultiLangSupport`：语言 XML（`lang/zh_CN/...`）提供 `key→翻译` 表，XML 里 `text="@strid_login"` 之类的引用在运行时替换。与 Qt 的 `tr()`+ Linguist 相比非常原始（无上下文、无复数），但机制本质相同：**字符串外置 + 运行时查表**。

> 📚 **本章参考资料**
> 1. 源码：`duilib/Core/GlobalManager.h`、`duilib/Utils/DpiManager.h/.cpp`、`duilib/Utils/MultiLangSupport.cpp`。
> 2. MSDN 高 DPI 桌面应用开发指南（必读，理解系统侧规则）：https://learn.microsoft.com/windows/win32/hidpi/high-dpi-desktop-application-development-on-windows
> 3. Qt 高 DPI 文档（对照目标态）：https://doc.qt.io/qt-6/highdpi.html

---

<a id="第10章"></a>
## 第 10 章 动画系统与虚拟列表

### 10.1 AnimationPlayer：定时器 + 插值器

`duilib/Animation/AnimationPlayer.h` 的层次：

```cpp
class AnimationPlayerBase {          // 抽象：生命周期管理
    virtual void Start();  void Stop();  void Continue();  void ReverseContinue();
    virtual int GetCurrentValue() = 0;      // ★ 子类回答"现在进度是多少"
};
class AnimationPlayer : public AnimationPlayerBase {   // 具体实现
    SetSpeedUpfactorA / SetSpeedDownfactorA   // 加/减速曲线参数（缓动）
    // 内部：TimerManager 定时器每帧回调 → 重算 CurrentValue → 更新控件属性 → Invalidate
};
```

动画的本质公式：**属性 = f(时间)**。播放器只负责"每帧问一次 f(t) 并应用到控件"，`f` 是插值/缓动函数（linear、ease-in-out……）。`AnimationManager` 管理每个控件的入场/悬停/退场动画绑定。这个"值动画（value animation）"模型与 Qt 的 `QPropertyAnimation`、Android 的 `ValueAnimator`、iOS 的 CABasicAnimation 完全同构——**学会一个等于学会全部**。

> 🧠 **打比方**：动画播放器是**走马灯的电机**：它不关心灯罩上画了什么（属性是什么），只负责匀速转动（按时间输出 0~100% 进度）；缓动函数是**变速箱**（先慢后快还是先快后慢）。

### 10.2 VirtualListBox：一万条数据只画十行

`duilib/Control/VirtualListBox.h`：普通 `ListBox` 为每条数据创建一个真实的 ListItem 控件——10 万条数据 = 10 万个 C++ 对象 + 布局计算，必卡。虚拟列表的思路：

- **数据与视图分离**：实现一个数据源接口（`GetCount`/`GetTextAt`...），数据在你手里；
- **只实例化可见项**：滚动时按可见区间复用/回收 item 控件（`VirtualLayout::ArrangeChild` 重写排列，只算窗口内的）；
- 预估总高度用估算值，滚动条长度近似。

> 🧠 **打比方**：普通列表 = 图书馆**把每本书都摆上书架**；虚拟列表 = **只摆一个橱窗（可见区）+ 后台仓库（你的数据源）**，观众看不到的书根本不搬出来，翻页时把橱窗里的书换掉就行。Qt 的 Model/View（QListView + QAbstractItemModel）就是这个思想的产品化：**View 只渲染 Model 声明的可见范围**。写列表类控件时，请直接按虚拟列表设计。

> 📚 **本章参考资料**
> 1. 源码：`duilib/Animation/AnimationPlayer.h/.cpp`、`duilib/Control/VirtualListBox.h/.cpp`、示例 `examples/controls` 中 list 相关。
> 2. Qt QPropertyAnimation（对照）：https://doc.qt.io/qt-6/qpropertyanimation.html ；Model/View 教程：https://doc.qt.io/qt-6/model-view-programming.html
> 3. 缓动函数可视化（easings.net，选缓动曲线必备）：https://easings.net/zh-cn
> 4. Android RecyclerView 的回收机制（虚拟列表工业级形态）：https://developer.android.com/develop/ui/views/layout/recyclerview

---

<a id="第11章"></a>
## 第 11 章 线程模型：来自 Chromium 的 base 库

### 11.1 单 UI 线程铁律

所有控件操作必须在创建它们的 UI 线程执行。工作线程下载完头像想更新控件？**不能直接调** `SetText`（竞争、崩溃）。duilib 内置了 Chromium 的 base 库（`base/framework/message_loop.h`），方案：

```cpp
// examples/basic/main.cpp —— 程序主入口
MainThread thread;                                        // 1. 一个 UI 线程
thread.RunOnCurrentThreadWithLoop(nbase::MessageLoop::kUIMessageLoop); // 2. 跑专属消息循环

// MainThread::Init 里注册线程身份
nbase::ThreadManager::RegisterThread(kThreadUI);

// 任意工作线程把"活儿"投递回 UI 线程：
nbase::ThreadManager::PostTask(kThreadUI, []() {
    safe_ui_operation();     // 这段代码将在 UI 线程的消息循环里执行
});
```

原理：`MessageLoop` 是可插拔的**消息泵**（`win_message_pump/win_ui_message_pump`），UI 泵同时处理 Win32 窗口消息和自定义任务队列；`PostTask` 把闭包塞进目标线程的任务队列，其消息泵醒来执行。**GUI 库的线程安全模型 = 单线程 UI + 任务投递**，Qt（`QMetaObject::invokeMethod`/queued connections）、Chromium、macOS（`dispatch_get_main_queue`）无一例外。

> 🧠 **打比方**：UI 线程 = **只有一位医生的外科手术室**：手术台（控件树）同时只允许一位医生操作；其他科室（工作线程）不能冲进来动刀，只能**递字条**（PostTask）预约，护士长（消息泵）按顺序把字条转交。递字条是异步的——你递完就去忙别的，别堵在门口等（避免死锁）。

### 11.2 顺带学到的 base 组件

`base/memory`：`SupportWeakCallback`（弱引用，第 3 章）；`base/callback`：闭包；`base/synchronization`：锁与条件变量；`base/file`、`base/time`。**这些和 GUI 无关但任何应用都需要**——Qt 也把 `QtCore`（容器/线程/IO）与 `QtGui` 分开，你的库同样值得分成"基础库"和"GUI 库"两层。

> 📚 **本章参考资料**
> 1. 源码：`base/framework/message_loop.h`、`base/thread/thread_manager.h`、`examples/basic/main.cpp`。
> 2. Chromium MessageLoop 设计资料：搜索 "Chromium message loop design"（Stephen White 的经典演讲《The Chromium Message Loop》幻灯片被广泛转载），或读本仓库自带的 `base/framework/readme.txt`。
> 3. Qt 线程基础（两种线程模型对比）：https://doc.qt.io/qt-6/thread-basics.html
> 4. 《Windows via C/C++》Jeffrey Richter——线程与 Windows 调度的权威著作。

---

<a id="第12章"></a>
## 第 12 章 Duilib 的短板：想写"Qt 那样的库"，要补哪些课

学完前 11 章，你已经能欣赏 duilib 的精巧，也该有能力看穿它的天花板。以下是逐项的差距分析与补课方案——**这就是你的产品需求清单**。

### 12.1 差距清单

| # | duilib 现状 | Qt 的做法 | 你的库要补什么 |
|---|---|---|---|
| 1 | 回调 = `std::function`，断连靠弱引用 | 信号槽：成员函数连接、自动断连、跨线程 queued | 极简信号槽（M5） |
| 2 | 无元对象系统：不能按名字反射属性/方法 | QMetaObject：QML/序列化/自动化测试的地基 | 属性系统 + 宏/代码生成注册（M5） |
| 3 | 全量重绘 + 部分脏矩形，无图形缓存 | Qt Quick Scene Graph：GPU 图层缓存与合成 | 至少把"绘制"与"画布"解耦，预留图层缓存 |
| 4 | 仅 Windows（GDI+），平台代码渗入 | QPA 平台抽象插件，Windows/macOS/Linux/嵌入式 | 从第 0 天隔离平台层（Window/Input/Render 三接口） |
| 5 | 文本渲染简单（GDI+ DrawString），无复杂排版 | HarfBuzz shaping + QTextDocument 富文本 | 至少设计 `ITextEngine` 接口，后端可换 |
| 6 | 事件无"捕获阶段"、无便捷手势 | 事件过滤器、QGesture | 冒泡之上加拦截器接口 |
| 7 | 无无障碍（a11y）、输入法支持弱 | 平台 a11y bridge、IME 深度支持 | 预留 Accessibility 接口（哪怕先空实现） |
| 8 | 单例全局状态，难测试 | QApplication 也是单例但资源可注入 | 依赖注入式资源管理 |
| 9 | 文档=注释生成的 doxygen，社区文档散 | 世界级文档 | 从第一个控件就写文档与示例 |

### 12.2 三个最值得抄进你库里的 Qt 思想

**① 元对象（属性+反射）是一切的钥匙。** 有了 `property(name)`/`signal(name)`，样式表才能作用于任意自定义属性、QML 式绑定才能实现、动画系统才能直接动画"任意属性"（`QPropertyAnimation` 动画的就是元属性）。实现路线：宏注册（`Q_PROPERTY` 风格）或编译期代码生成（现代做法）。

**② 所有权模型要一句话说清。** Qt 的规则简单到极致：**父对象析构时删除所有子对象**（QObject 树），信号槽连接随对象析构自动断开。duilib 的规则是"树形裸指针 + 弱引用补丁"，能用但要靠纪律。你的库请把所有权规则写进架构文档第一页。

**③ 平台抽象的粒度决定移植成本。** Qt 用 QPA 把"平台"抽象成十来个插件接口（窗口、输入、剪贴板、DPI、OpenGL 上下文…）。第 3 章你已看到 duilib 的 `Window` 是唯一的平台接口——粒度太粗。你应在第一天就定下四个平台接口：`PlatformWindow` / `InputSource` / `RenderDevice` / `TimerService`。

> 🧠 **打比方 · 总结：duilib 是精装修的公寓，Qt 是带地基系统的城市**
>
> duilib 聪明地选择了"只解决一栋楼的问题"：Windows、GDI+、皮肤驱动、小团队——所以它小而美（核心数万行，两周能读透）。Qt 解决"整座城市的问题"：跨平台、多渲染后端、脚本绑定、无障碍、嵌入式——所以它庞大（数百万行）。**你没有必要一步建成城市，但请按城市的图纸打地基**（平台抽象、元对象、所有权规则）；公寓的精装修技巧（脏矩形、虚拟列表、事件冒泡）duilib 已经教给你了。

> 📚 **本章参考资料**
> 1. Qt Quick Scene Graph 与 Qt Widgets 渲染对比：https://doc.qt.io/qt-6/qtquick-visual-scenegraph.html
> 2. Qt QPA（平台抽象插件）架构：https://doc.qt.io/qt-6/qpa.html
> 3. Qt 元对象系统：https://doc.qt.io/qt-6/metaobjects.html ；属性系统：https://doc.qt.io/qt-6/properties.html
> 4. HarfBuzz 文本整形引擎：https://harfbuzz.github.io/
> 5. Flutter 为什么自建渲染管线（理解"控件库 vs 渲染引擎"的边界）：https://docs.flutter.dev/resources/architectural-overview
> 6. 游戏引擎 UI 的另一种思路（Dear ImGui，立即模式 UI 的极端形态，值得对比阅读）：https://github.com/ocornut/imgui

---

<a id="第13章"></a>
## 第 13 章 实战路线图：手写一个 mini GUI 库的六个里程碑

读完不写等于没读。以下路线图每一步都有**明确的验收标准**，全部基于你新学到的 duilib 知识。建议 C++17、先 Windows-only、渲染先用 GDI+（和你读的源码一一对应）。

**M0：平台沙盒（第 1 章知识）**
手写 RegisterClass/CreateWindow/消息循环，窗口里画一行字。验收：点关闭退出，无内存泄漏（任务管理器验证句柄数）。

**M1：Window 封装 + 脏矩形重绘（第 3、6 章）**
封装 `class Window`（HWND 持有 + `HandleMessage` 虚函数）。实现 `Invalidate(rect)` 记账 + `WM_PAINT` 双缓冲绘制一个 `RectWidget`。验收：拖动窗口大小不闪烁；`WM_ERASEBKGND` 吞掉。

**M2：控件树 + XML（第 4、7 章）**
`Widget` 基类（位置/可见/父子）+ `ContainerWidget`；写一个 200 行的迷你 XML 解析（或引入 tinyxml2）；实现 `name → 工厂函数` 注册表，从 XML 建树。验收：XML 里改一个属性，界面变化；`FindWidget("id")` 可用。

**M3：布局引擎（第 5 章）**
实现 Measure pass（`SizeHint`）+ Arrange pass（`SetGeometry`），Horizontal/Vertical 布局 + stretch 权重 + margin。验收：窗口拉伸时布局正确；嵌套布局（VBox 套 HBox）正确。

**M4：渲染抽象 + 控件三件套（第 6 章）**
`IRenderContext` 接口 + GDI+ 实现；实现 Label/Button/RoundRect。按钮三态（normal/hover/pressed）+ 九宫格图片绘制。验收：按钮悬停按下反馈流畅，无闪烁。

**M5：信号槽 + 属性系统（第 8、12 章）**
极简信号槽：`Signal<void(int)>` + `Connect` + 对象析构自动断连（用弱引用实现，你已在 duilib 见过底稿）；宏注册 `PROPERTY(int, x)` 自动生成 getter/setter + 变更信号。验收：按钮 `clicked` 连接到 3 个槽；槽所属对象销毁后触发不崩溃。

**M6：综合应用（第 9~11 章）**
虚拟列表（100 万行流畅滚动）+ 一个 300ms 缓动动画 + 工作线程 PostTask 更新进度条。验收：任务管理器 CPU < 5% 时界面仍能流畅动画。

每一步都可以回到本仓库找参考实现——这份源码就是你的标准答案库。读完 duilib 再写，你相当于**开卷考试**。

---

<a id="附录a"></a>
## 附录 A 术语表

| 术语 | 一句话解释 |
|---|---|
| HWND | Windows 窗口的整数句柄，系统侧窗口的唯一身份证 |
| WndProc | 窗口过程，系统回调的消息处理函数 |
| 消息循环 | `取消息→分发` 的 while 循环，GUI 程序的心跳 |
| WM_PAINT | "有区域脏了请重画"的系统通知 |
| 无效区域/脏矩形 | 需要重画的最小矩形范围 |
| DirectUI | 单 HWND + 全部控件自绘的架构（duilib 名称由来） |
| 命中测试 | 判断一个屏幕坐标属于哪个控件 |
| 组合模式 | 叶子与容器同接口，形成可递归操作的对象树 |
| 测量/排列 | 布局两阶段：先问需求（Estimate/sizeHint），再定位置（SetPos/setGeometry） |
| 双缓冲 | 先画到内存位图再一次性上屏，消除闪烁 |
| 立即模式 | 每帧从头按序绘制全部图形（duilib/Qt Widgets） |
| 保留模式 | 记录图元列表交给 GPU 增量合成（Qt Quick/浏览器/Flutter） |
| 事件冒泡 | 事件未处理则沿父链向上传递（DOM/duilib 同构） |
| 九宫格绘制 | 图片四角不拉伸、四边单向拉伸、中心平铺的皮肤绘制法 |
| DPI 缩放 | 逻辑像素 × 系统缩放比 = 物理像素 |
| 虚拟列表 | 只为可见数据项创建控件，数据留在数据源 |
| 弱引用 | 不阻止对象销毁的引用，用于回调安全校验 |
| 信号槽 | Qt 的对象间通信机制：发射者不关心接收者 |
| 元对象 | Qt 的运行时反射系统（类名/属性/信号表的运行期描述） |

<a id="附录b"></a>
## 附录 B 总参考资料

**本仓库内部**
- `README.md`、`docs/SUMMARY.md`（官方文档目录）、`docs/` 下各控件说明
- `examples/basic`（最小示例）、`examples/controls`（控件全集）、`examples/layouts`（布局示范）
- `base/framework/readme.txt`（base 消息循环的作者注释）

**Windows 基础**
1. Charles Petzold,《Programming Windows》, 5th Edition —— Win32 GUI 圣经
2. Jeffrey Richter,《Windows via C/C++》—— 线程/内存/调度
3. Microsoft Learn: Learn to Program for Windows —— https://learn.microsoft.com/windows/win32/learnwin32/
4. Raymond Chen, The Old New Thing —— https://devblogs.microsoft.com/oldnewthing/

**GUI 架构与设计模式**
5. GoF,《设计模式：可复用面向对象软件的基础》—— Composite/Observer/Strategy/Bridge/Abstract Factory/Template Method 六个模式是 GUI 库的骨架
6. Refactoring.Guru 中文站 —— https://refactoring.guru/zh-CN/design-patterns
7. Qt 官方文档（重点篇目）：Object Trees / Signals & Slots / Events / Layout / Scene Graph / QPA / Meta-Objects —— https://doc.qt.io/qt-6/

**现代渲染参照系**
8. Flutter 架构总览 —— https://docs.flutter.dev/resources/architectural-overview
9. Skia 图形库 —— https://skia.org
10. Dear ImGui（立即模式另一极）—— https://github.com/ocornut/imgui
11. MDN 事件参考（冒泡/捕获）—— https://developer.mozilla.org/zh-CN/docs/Learn/JavaScript/Building_blocks/Events

**duilib 血统**
12. duilib 社区版（Bjarke Viksøe 原作→国人社区维护）—— https://github.com/duilib/duilib
13. 本项目（网易云信 NIM Duilib）—— https://github.com/netease-im/NIM_Duilib_Framework

---

## 结语

把这份教程读两遍：第一遍顺着读，建立"消息→树→布局→绘制→事件"的全景；第二遍开着一个 IDE，对照每章的源码索引把 `Window::HandleMessage`、`Box::SetPos`、`Control::Paint`、`WindowBuilder::_Parse`、`CEventSource::operator()` 这五个函数**逐行**读一遍——这五个函数分别是消息翻译、布局、绘制、界面解析、事件派发的**心脏**，读懂它们，你就读懂了一个 GUI 库的 80%。

剩下的 20% 是最难也最有趣的部分：**用 Qt 的思想重新设计它们**。那是属于你的库的故事。

