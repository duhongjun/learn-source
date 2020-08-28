import { useEffect, useLayoutEffect } from 'react'

// 在服务端(应该是指SSR)使用useLayoutEffect时, React 会发出警告
// 为了解决这个问题, 需要在服务端使用useEffect(空函数), 浏览器端使用 useLayoutEffect
// 我们需要 useLayoutEffect 来确保 store subscription 回调里总是可以 获取到 来自最新一次render, commit阶段的 selector
// 否则 一个 store 的更新可能处于 render 和 effect 之间, 这样可能导致丢失更新;
// 我们也必须保证store 的 subscription 同步创建, 否则一个 store 的更新可能在 subscription 创建前发生, 并且可能观察到不一致的状态
// 注: useLayoutEffect 会在DOM变动后立即同步执行, 会阻塞渲染
export const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' &&
  typeof window.document !== 'undefined' &&
  typeof window.document.createElement !== 'undefined'
    ? useLayoutEffect
    : useEffect
