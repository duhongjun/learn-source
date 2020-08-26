import React, { useMemo, useEffect } from 'react'
import { ReactReduxContext } from './Context'
import Subscription from '../utils/Subscription'

function Provider({ store, context, children }) {
  // 将store和subscription当做context值
  const contextValue = useMemo(() => {
    // 声明一个Subscription实例。subscription主要实现了数据订阅的逻辑
    const subscription = new Subscription(store)
    subscription.onStateChange = subscription.notifyNestedSubs
    return {
      store,
      subscription
    }
  }, [store])
  
  // 缓存state的值
  // useMemo会在渲染期间执行, useEffect在DOM完成更改后调用, 所以可以对比差异
  const previousState = useMemo(() => store.getState(), [store])

  useEffect(() => {
    const { subscription } = contextValue
    // 通知 subscription 进行 订阅
    subscription.trySubscribe()

    // 如果state发生了变化, 通知subscription, 触发所有的监听函数
    if (previousState !== store.getState()) {
      subscription.notifyNestedSubs()
    }

    // 组件销毁时, 解绑
    return () => {
      subscription.tryUnsubscribe()
      subscription.onStateChange = null
    }
  }, [contextValue, previousState])

  const Context = context || ReactReduxContext
  return <Context.Provider value={contextValue}>{children}</Context.Provider>
}

export default Provider
