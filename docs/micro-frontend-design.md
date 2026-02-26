# 无界（WuJie）微前端基座设计方案

## 一、项目现状分析

### 1.1 技术栈

| 类别 | 技术选型 |
|------|----------|
| 框架 | Vue 3 + Vite 5 |
| UI库 | Ant Design Vue Next (antdv-next) |
| 状态管理 | Pinia |
| 路由 | Vue Router |
| 构建 | Turbo (monorepo) |
| 包管理 | pnpm |

### 1.2 现有架构

```
vben-admin-monorepo/
├── apps/
│   └── web-antdv-next/          # 主应用
├── packages/
│   ├── @core/                   # 核心 UI 组件库
│   │   ├── base/               # 基础工具（icons, shared, typings）
│   │   ├── ui-kit/             # UI 组件（menu, form, layout, tabs）
│   │   └── composables/        # 组合式函数
│   ├── effects/                # 业务效果（layouts, request）
│   ├── stores/                  # Pinia 状态管理
│   ├── utils/                  # 工具函数
│   └── styles/                  # 样式
└── internal/                    # 内部工具配置
```

### 1.3 现有菜单系统

- **菜单来源**: 后端 API `/menu/all` 返回 `MenuRecordRaw[]`
- **菜单结构**: 树形结构，支持多级嵌套
- **路由生成**: 基于菜单数据动态生成路由
- **状态管理**: `AccessStore` 存储 `accessMenus` 和 `accessRoutes`

```typescript
// 现有菜单类型
interface MenuRecordRaw {
  name: string;
  path: string;
  icon?: Component | string;
  activeIcon?: string;
  children?: MenuRecordRaw[];
  order?: number;
  show?: boolean;
  disabled?: boolean;
  badge?: string;
  badgeType?: 'dot' | 'normal';
}
```

---

## 二、微前端基座架构设计

### 2.1 整体架构

采用 **主应用（基座）+ 子应用（业务模块）** 模式：

```
┌─────────────────────────────────────────────────────────────────┐
│                        主应用 (Host)                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  布局容器 (BasicLayout)                                    │  │
│  │  ┌────────────┬─────────────────────────────────────────┐ │  │
│  │  │  菜单区域   │           内容区域                       │ │  │
│  │  │ (Menu)     │  ┌───────────────────────────────────┐  │ │  │
│  │  │            │  │  无界容器 (WuJie)                  │  │ │  │
│  │  │ 主应用菜单  │  │  ┌─────────────────────────────┐  │  │ │  │
│  │  │ 子应用菜单  │  │  │     子应用内容               │  │  │ │  │
│  │  │ (动态注入)  │  │  │                             │  │  │ │  │
│  │  │            │  │  └─────────────────────────────┘  │  │ │  │
│  │  └────────────┴─────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  全局状态 (Pinia) - 跨应用共享                            │  │
│  │  • 用户信息 • 权限 • 主题 • 国际化                        │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
         ▲                ▲                ▲
         │                │                │
    ┌────┴────┐     ┌────┴────┐     ┌────┴────┐
    │ 子应用1  │     │ 子应用2  │     │ 子应用3  │
    │ 财务系统 │     │ 审批系统 │     │ 报表系统 │
    └─────────┘     └─────────┘     └─────────┘
```

### 2.2 菜单传递方案

提供 **两种菜单模式**，灵活可选：

#### 方案 A：主应用集中管理（推荐）

```
┌─────────────────────────────────────────────────────────────┐
│  主应用 (基座)                                               │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  菜单配置 (后端下发 + 前端配置混合)                        ││
│  │  {                                                       ││
│  │    path: '/finance',                                    ││
│  │    name: '财务管理',                                      ││
│  │    type: 'micro',     // 标记为微应用                    ││
│  │    microApp: 'finance-app',                              ││
│  │    microPath: '/finance/dashboard'                       ││
│  │  }                                                       ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

**优点**:
- 菜单集中管理，维护方便
- 权限控制统一
- 适合多团队协作

**适用场景**:
- 企业内部管理系统
- 需要统一权限管控的系统

#### 方案 B：子应用主动注入（适用于子应用独立部署场景）

```
┌─────────────────────────────────────────────────────────────┐
│  子应用 (finance-app)                                        │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  启动时通过 window.parent.postMessage 推送菜单           ││
│  │  {                                                       ││
│  │    type: 'MENU_PUSH',                                   ││
│  │    payload: [                                           ││
│  │      { path: '/finance/dashboard', name: '工作台' },   ││
│  │      { path: '/finance/account', name: '账户管理' },   ││
│  │    ]                                                     ││
│  │  }                                                       ││
│  └─────────────────────────────────────────────────────────┘│
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  主应用监听消息，更新菜单                                     │
│  window.addEventListener('message', (e) => {               │
│    if (e.data.type === 'MENU_PUSH') {                      │
│      accessStore.mergeMenus(e.data.payload);               │
│    }                                                        │
│  });                                                        │
└─────────────────────────────────────────────────────────────┘
```

**优点**:
- 子应用独立性强
- 支持子应用独立部署
- 适合微服务架构

**适用场景**:
- SaaS 多租户系统
- 需要独立发布的业务模块

---

## 三、核心实现方案

### 3.1 目录结构改造

```
apps/
├── web-antdv-next/              # 主应用（基座）
│   ├── src/
│   │   ├── micro/               # 微前端核心模块 [新增]
│   │   │   ├── config.ts         # 子应用配置
│   │   │   ├── apps.ts          # 子应用注册
│   │   │   ├── WujieApp.vue     # 无界容器组件
│   │   │   ├── useMenuBus.ts    # 菜单通信Hook
│   │   │   └── index.ts
│   │   ├── router/
│   │   │   └── guard.ts         # 改造支持微应用路由
│   │   └── ...
│   └── package.json
│
├── micro-finance/               # 子应用示例 - 财务系统 [新增]
│   ├── src/
│   │   ├── main.ts              # 改造为 UMD 格式导出
│   │   ├── bootstrap.ts
│   │   └── ...
│   └── package.json
│
├── micro-approval/              # 子应用示例 - 审批系统 [新增]
│   └── ...
│
└── micro-report/                # 子应用示例 - 报表系统 [新增]
    └── ...
```

### 3.2 子应用配置定义

```typescript
// apps/web-antdv-next/src/micro/config.ts

import type { MicroAppConfig } from './types';

export const microApps: MicroAppConfig[] = [
  {
    name: 'finance-app',
    title: '财务系统',
    entry: '//localhost:3001',
    container: '#micro-container',
    slug: '/finance',
    props: {
      token: '{{TOKEN}}',
    },
  },
  {
    name: 'approval-app',
    title: '审批系统',
    entry: '//localhost:3002',
    container: '#micro-container',
    slug: '/approval',
  },
  {
    name: 'report-app',
    title: '报表系统',
    entry: '//localhost:3003',
    container: '#micro-container',
    slug: '/report',
  },
];

export interface MicroAppConfig {
  name: string;
  title: string;
  entry: string;
  container: string;
  slug: string;
  props?: Record<string, any>;
}
```

### 3.3 无界容器组件

```vue
<!-- apps/web-antdv-next/src/micro/WujieApp.vue -->
<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { useWujie } from 'wujie';
import { useRoute } from 'vue-router';

interface Props {
  appName: string;
  appPath: string;
}

const props = defineProps<Props>();
const route = useRoute();
const { start, destroy } = useWujie();

const containerRef = ref<HTMLElement | null>(null);
const isActive = ref(false);

// 监听路由变化，切换子应用
watch(
  () => route.path,
  (newPath) => {
    isActive.value = newPath.startsWith(props.appPath);
  },
  { immediate: true }
);

onMounted(() => {
  if (containerRef.value) {
    start({
      name: props.appName,
      el: containerRef.value,
      url: props.appPath,
    });
  }
});

onUnmounted(() => {
  destroy(props.appName);
});
</script>

<template>
  <div ref="containerRef" class="wujie-app-container" />
</template>

<style scoped>
.wujie-app-container {
  width: 100%;
  height: 100%;
}
</style>
```

### 3.4 菜单通信机制

```typescript
// apps/web-antdv-next/src/micro/useMenuBus.ts
import { useAccessStore } from '@vben/stores';
import type { MenuRecordRaw } from '@vben-core/typings';

interface MenuPushPayload {
  type: 'MENU_PUSH' | 'MENU_REPLACE' | 'MENU_CLEAR';
  appName: string;
  payload?: MenuRecordRaw[];
}

export function useMenuBus() {
  const accessStore = useAccessStore();

  function setupMenuListener() {
    window.addEventListener('message', (event: MessageEvent<MenuPushPayload>) => {
      const { data } = event;
      
      if (!event.origin.includes('localhost') && !event.origin.includes('your-domain.com')) {
        return;
      }

      switch (data.type) {
        case 'MENU_PUSH':
          accessStore.appendMenus(data.appName, data.payload || []);
          break;
        case 'MENU_REPLACE':
          accessStore.replaceAppMenus(data.appName, data.payload || []);
          break;
        case 'MENU_CLEAR':
          accessStore.removeAppMenus(data.appName);
          break;
      }
    });
  }

  function postMessageToApp(appName: string, data: any) {
    window[appName]?.$wujie?.bus?.$emit('parent-message', data);
  }

  return { setupMenuListener, postMessageToApp };
}
```

### 3.5 路由守卫改造

```typescript
// apps/web-antdv-next/src/router/guard.ts 改造

import { microApps } from '#/micro/config';

function setupAccessGuard(router: Router) {
  router.beforeEach(async (to, from) => {
    const microApp = microApps.find((app) => 
      to.path.startsWith(app.slug)
    );

    if (microApp) {
      to.meta.microApp = microApp.name;
      to.meta.microPath = to.path.replace(microApp.slug, '/');
      return true;
    }

    // ... 原有逻辑
  });
}
```

### 3.6 AccessStore 扩展

```typescript
// packages/stores/src/modules/access.ts 扩展

interface AccessState {
  // ... 原有字段
  appMenus: Record<string, MenuRecordRaw[]>;
}

export const useAccessStore = defineStore('core-access', {
  actions: {
    // ... 原有方法
    
    appendMenus(appName: string, menus: MenuRecordRaw[]) {
      this.appMenus[appName] = [...(this.appMenus[appName] || []), ...menus];
      this.accessMenus = this.mergeAllMenus();
    },
    
    replaceAppMenus(appName: string, menus: MenuRecordRaw[]) {
      this.appMenus[appName] = menus;
      this.accessMenus = this.mergeAllMenus();
    },
    
    removeAppMenus(appName: string) {
      delete this.appMenus[appName];
      this.accessMenus = this.mergeAllMenus();
    },
    
    mergeAllMenus(): MenuRecordRaw[] {
      const allMenus = [...this.baseMenus];
      Object.values(this.appMenus).forEach((menus) => {
        allMenus.push(...menus);
      });
      return allMenus;
    },
  },
});
```

### 3.7 子应用菜单推送示例

```typescript
// 子应用 (micro-finance) main.ts 改造

import { boot } from 'wujie-vue3';

boot({
  name: 'finance-app',
  root: document.getElementById('app'),
  mounted() {
    window.parent.postMessage({
      type: 'MENU_PUSH',
      appName: 'finance-app',
      payload: [
        {
          name: '财务工作台',
          path: '/finance/dashboard',
          icon: 'lucide:chart-pie',
          order: 1,
        },
        {
          name: '账户管理',
          path: '/finance/account',
          icon: 'lucide:wallet',
          order: 2,
        },
        {
          name: '交易记录',
          path: '/finance/transactions',
          icon: 'lucide:receipt',
          order: 3,
        },
      ],
    }, '*');
  },
  beforeDestroy() {
    window.parent.postMessage({
      type: 'MENU_CLEAR',
      appName: 'finance-app',
    }, '*');
  },
});
```

---

## 四、关键改造点清单

| 序号 | 改造项 | 涉及文件 | 优先级 |
|------|--------|----------|--------|
| 1 | 安装无界依赖 | package.json | P0 |
| 2 | 创建微前端核心模块 | apps/web-antdv-next/src/micro/ | P0 |
| 3 | 改造路由守卫支持微应用 | apps/web-antdv-next/src/router/guard.ts | P0 |
| 4 | 扩展菜单类型支持微应用 | packages/@core/base/typings/src/menu-record.ts | P0 |
| 5 | 改造 AccessStore 支持菜单合并 | packages/stores/src/modules/access.ts | P1 |
| 6 | 创建子应用脚手架模板 | 新建 packages/micro-template/ | P1 |
| 7 | 改造布局支持微应用容器 | packages/effects/layouts/src/basic/layout.vue | P1 |
| 8 | 配置开发环境代理 | vite.config.mts | P2 |
| 9 | 制定子应用接入规范 | 文档 | P2 |

---

## 五、子应用接入规范

### 5.1 技术要求

| 要求项 | 最低版本 |
|--------|----------|
| Vue | 3.2+ |
| Vite | 4+ |
| Node.js | 18+ |

### 5.2 必需配置

```typescript
// vite.config.mts 子应用配置
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { wujieVite } from 'wujie-vite';

export default defineConfig({
  plugins: [
    vue(),
    wujieVite(),
  ],
  base: './',
  build: {
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
});
```

### 5.3 生命周期

| 生命周期 | 说明 | 适用场景 |
|---------|------|---------|
| created | 子应用实例创建 | 初始化状态 |
| mounted | 子应用挂载完成 | 推送菜单、获取主应用数据 |
| beforeDestroy | 子应用卸载前 | 清理资源、保存状态 |
| destroyed | 子应用销毁 | 彻底清理 |

---

## 六、部署方案

### 6.1 开发环境

```bash
# 启动主应用
pnpm dev:antdv-next

# 启动子应用（并行）
pnpm dev:finance   # localhost:3001
pnpm dev:approval # localhost:3002
```

### 6.2 生产环境

**方案一：独立域名**
```
主应用: https://admin.example.com
财务系统: https://finance.example.com
审批系统: https://approval.example.com
```

**方案二：统一域名（推荐）**
```
https://admin.example.com/           # 主应用
https://admin.example.com/finance/   # 财务系统子应用
https://admin.example.com/approval/  # 审批系统子应用
```

---

## 七、总结

本方案基于 **无界（WuJie）** 实现微前端基座，充分利用其以下特性：

1. **单实例模式** - 主应用与子应用共享 JS 运行时，减少内存开销
2. **vite 插件支持** - 子应用开发体验与主应用一致
3. **通信机制完善** - 支持 postMessage 和自定义事件
4. **样式隔离** - 避免子应用样式污染主应用

通过两种菜单模式（集中管理/主动注入），可以灵活适应不同业务场景。

---

## 附录

### A. 相关依赖

```json
{
  "dependencies": {
    "wujie": "^1.0.0",
    "wujie-vue3": "^1.0.0"
  },
  "devDependencies": {
    "wujie-vite": "^1.0.0"
  }
}
```

### B. 菜单类型扩展

```typescript
// 扩展菜单类型支持微应用
interface MicroMenuRecordRaw extends MenuRecordRaw {
  type?: 'menu' | 'micro';
  microApp?: string;
  microPath?: string;
}
```
