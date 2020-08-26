## react-redux做了什么

react-redux 帮我们实现了将 redux 的状态注入到我们的组件中, 同时在状态更新时重新渲染. 

思考一下如果我们自己实现 React 和 Redux 的连接, 需要怎么做呢?

我们的需求是实现状态的跨层级通信, 所以需要借助 `context` 这个特性.

* 实现一个 `Provider`, 传入`store`作为`context`的值, 供有需要的 "消费者" 获取和使用.
* 实现一个统一的注入方法, 将需要的数据注入到组件的`props`中
* 当组件内需要更新数据时,调用`store.dispatch`派发`action`,更新`store`中的数据
* 实现一个统一的订阅方法, 利用`store.subscribe`订阅数据的变化, 通过`setState`或者`forceUpdate`重新渲染我们的组件.

而`react-redux`就帮我们做好了这些:
* 提供了顶层 `Provider` 容器接受 `store` 作为 `props`，再将 `store` 作为 `context` 内容传入子孙组件中.
* 提供了 `connect` 高阶组件, 可以使用其提供的 `selector` 将我们需要的数据和action 注入到组件的props中.
* 在 `Provider` 和 `connect` 中实现了订阅和更新的逻辑.
* 还提供了 hooks 版本

接下来我们就来看看这些功能是如何实现的.

## 源码部分

<u>下面我们按照使用时的顺序, 依次来分析它的实现.(删除了所有开发时的报错判断)</u>

### 1. Provider

```javascript
import React, { useMemo, useEffect } from 'react'
import { ReactReduxContext } from './Context'
import Subscription from '../utils/Subscription'

function Provider({ store, context, children }) {
  const contextValue = useMemo(() => {
    const subscription = new Subscription(store)
    subscription.onStateChange = subscription.notifyNestedSubs
    return {
      store,
      subscription
    }
  }, [store])
  // useMemo会在渲染期间执行, useEffect在DOM完成更改后调用, 时机不同所以可以对比差异
  const previousState = useMemo(() => store.getState(), [store])

  useEffect(() => {
    const { subscription } = contextValue
    subscription.trySubscribe()
    
    if (previousState !== store.getState()) {
      subscription.notifyNestedSubs()
    }

    return () => {
      subscription.tryUnsubscribe()
      subscription.onStateChange = null
    }
  }, [contextValue, previousState])

  const Context = context || ReactReduxContext
  return <Context.Provider value={contextValue}>{children}</Context.Provider>
}

export default Provider

```

* 内部定义了一个 `contextValue`, 值为 store 和 订阅器实例,  callback内部初始化了订阅器实例, 并监听了 store 的 state 变化
* 缓存最近一次的 state 值 `previousState`.
* 定义了一个effect, 返回一个清理函数用于组件卸载时用; 依赖项为 `contextValue` 和 `previousState`, 当依赖发生变化时, 重新执行 `subscription.trySubscribe()` 进行订阅; 如果state的值发生了变化, 则调用 `subscription.notifyNestedSubs()` 进行通知.
*  使用 `React.createContext`创建 `context`, 然后返回使用 `Context.Provider`包裹的组件.

小结: 

> 逻辑比较清晰, 很容易理解, 里面包含了很多 `subscription` 的方法调用, 是源码的重头戏之一, 也是我们接下来要去研究的部分~

### 2. Subscription

文件路径: `utils/Subscription.js`, 源码主要分两部分:
```javascript
function createListenerCollection() {
  // ...
}
export default class Subscription {
  // ...
}
```

#### 先来看下 `Subscription` 类:
```javascript
export default class Subscription {
  constructor(store, parentSub) {
    this.store = store
    this.parentSub = parentSub
    this.unsubscribe = null  // 解除订阅的函数
    this.listeners = nullListeners

    this.handleChangeWrapper = this.handleChangeWrapper.bind(this)
  }

  addNestedSub(listener) {
    this.trySubscribe()
    return this.listeners.subscribe(listener)
  }

  notifyNestedSubs() {
    this.listeners.notify()
  }

  // Provider里实例化时对 onStateChange 进行了赋值
  handleChangeWrapper() {
    if (this.onStateChange) {
      this.onStateChange()
    }
  }
  // 是否订阅, 防止重复订阅和解除订阅
  isSubscribed() {
    return Boolean(this.unsubscribe)
  }

  // 订阅
  trySubscribe() {
    if (!this.unsubscribe) {
      this.unsubscribe = this.parentSub
        ? this.parentSub.addNestedSub(this.handleChangeWrapper)
        : this.store.subscribe(this.handleChangeWrapper)

      this.listeners = createListenerCollection()
    }
  }

  // 取消订阅, 清空并重置监听函数
  tryUnsubscribe() {
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = null
      this.listeners.clear()
      this.listeners = nullListeners
    }
  }
}
```

我们回顾一下在 `Provider` 中是如何使用的:
```javascript
  const subscription = new Subscription(store)
  subscription.onStateChange = subscription.notifyNestedSubs
  useEffect(() => {
  const { subscription } = contextValue
  subscription.trySubscribe()
  
  if (previousState !== store.getState()) {
    subscription.notifyNestedSubs()
  }

  return () => {
    subscription.tryUnsubscribe()
    subscription.onStateChange = null
  }
}, [contextValue, previousState])
```
* 实例化时接收两个参数, `store` 和 `parentSub`, 也就是可以传入父级的订阅器. 在 `Provider` 中的相当于最顶层的订阅, 所以没有 `parentSub`
* 对 `handleChangeWrapper` 进行了包装, 它就是 store 中 state变化后会执行的通知回调; 在`Provider`中对应着 `notifyNestedSubs`方法, 在其他实例中对应着 `checkForUpdates` (会在讲解connect的时候说).
* 接着调用 `trySubscribe` 进行订阅, 会返回一个用于解绑的函数; 类还定义了一个 `unsubscribe` 变量防止重复订阅; 在 `Provider`中是直接订阅 store, 在其他实例中(即提供了parentSub), 订阅的是 `parentSub`;  同时调用 `createListenerCollection` 初始化 `listeners`, 这个方法我们接下来说
* 接着看下有 `parentSub` 时增加订阅的方法 `addNestedSub`, 它会调用 `listeners` 的 `subscribe` 方法增加一个订阅者
* 发生更改时, 调用 `notifyNestedSubs` 通知自身的订阅者们, 它会调用 `listeners` 的 `notify` 方法

`Subscription`的逻辑比较清晰, 接下来我们看下 `createListenerCollection` 是如何实现的

#### createListenerCollection

先上源码:
```javascript
import { getBatch } from './batch'

function createListenerCollection() {
  const batch = getBatch()
  let first = null
  let last = null

  return {
    clear() {
      first = null
      last = null
    },
    notify() {
      batch(() => {
        let listener = first
        while (listener) {
          listener.callback()
          listener = listener.next
        }
      })
    },
    get() {
      let listeners = []
      let listener = first
      while (listener) {
        listeners.push(listener)
        listener = listener.next
      }
      return listeners
    },
    subscribe(callback) {
      let isSubscribed = true

      let listener = (last = {
        callback,
        next: null,
        prev: last
      })

      if (listener.prev) {
        listener.prev.next = listener
      } else {
        first = listener
      }

      return function unsubscribe() {
        if (!isSubscribed || first === null) return
        isSubscribed = false

        if (listener.next) {
          listener.next.prev = listener.prev
        } else {
          last = listener.prev
        }
        if (listener.prev) {
          listener.prev.next = listener.next
        } else {
          first = listener.next
        }
      }
    }
  }
}
```

首先引入了一个 `getBatch` 函数, 在入口文件中调用了 `setBatch` 进行设置, 使用的是 `react-dom` 提供的批量更新(这里不考虑RN); 用处是在 `notify` 批量通知所有的订阅者时做些性能优化

> 在react提供的合成事件或者生命周期中连续调用 `setState`, 会对 state 进行合并, 只会引起一次 render, 就是用到了 react-dom 提供的 `unstable_batchedUpdates`; react-redux用批量更新是为了确保 `在react外dispatch 多个action时 只导致一次render`; 官方文档对此有 [解释](https://react-redux.js.org/api/batch) 

* 这里采用的是双向链表的数据结构, 在内部缓存了头指针 `first` 和 尾指针 `last`
* 返回包含四个方法的对象: 
  ```javascript
    clear() {
      // 清空头指针和尾指针, 整个链表没有引用自然会被回收
    }
    notify() {
      // 使用batch函数, 遍历整个链表, 执行每个监听函数
    }
    get() {
      // 遍历整个链表, 将所有监听函数转换成数组返回
    }
    subscribe() {
      // 整体逻辑分两部分:
      // 1: 将监听函数插入到链表中
      // 2: 返回一个函数, 函数的功能是在链表中删除该节点
    }
  ```

#### 总结:

  通过 `Subscription`类, 实现了自上而下的事件链条, 类似于事件冒泡的形式. 当`store`发生变化时, 会触发`Provider`中的state监听, 通知所有它的子级订阅者, 然后子级再通知子级的子级....按着层级依次向下传递. 

### 参考资料

[react-redux doc](https://react-redux.js.org/api/batch)

[react-redux repo](https://github.com/reduxjs/react-redux)

[react hooks](https://zh-hans.reactjs.org/docs/hooks-overview.html)

[带着问题看React-Redux源码](https://zhuanlan.zhihu.com/p/80655889)