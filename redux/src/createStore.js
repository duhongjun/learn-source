import $$observable from 'symbol-observable'
import ActionTypes from './utils/actionTypes'
import isPlainObject from './utils/isPlainObject'

/**
 * 创建一个redux store 保存 状态树
 * 唯一改变store中数据的方式就是调用 `dispatch`
 *
 * 在你的app中应该只有一个store.
 * 想要指定状态树的不同部分如何响应操作, 你可以使用 `combineReducers` 把几个 reducer 结合成 一个 reducer 函数
 *
 * @param {Function} reducer 一个返回下一个状态树的函数, 提供当前状态树 和 要处理的action
 *
 * @param {any} [preloadedState] 初始状态, 如果使用了 `combineReducers` 去生成根reducer函数, 则此参数必须是一个拥有和 `combineReducers` 的key 相同的结构
 *
 * @param {Function} [enhancer] store的增强器. 可以选择性的使用第三方插件例如 中间件, 时间旅行, 数据持久化 等等..
 * redux 自带的的唯一 store增强器 是 `applyMiddleware()`
 *
 * @returns {Store} 一个可以让你读取state, dispatch actions 和 订阅变化 的 store
 */
export default function createStore(reducer, preloadedState, enhancer) {
  // 对不传preloadedState 直接传enhancer 做支持
  if (typeof preloadedState === 'function' && typeof enhancer === 'undefined') {
    enhancer = preloadedState
    preloadedState = undefined
  }

  if (typeof enhancer !== 'undefined') {
    if (typeof enhancer !== 'function') {
      throw new Error('Expected the enhancer to be a function.')
    }
    // applyMiddleware调用返回的是一个接受createStore为参数的函数
    return enhancer(createStore)(reducer, preloadedState)
  }

  if (typeof reducer !== 'function') {
    throw new Error('Expected the reducer to be a function.')
  }

  let currentReducer = reducer
  let currentState = preloadedState
  let currentListeners = []
  let nextListeners = currentListeners
  let isDispatching = false

  function ensureCanMutateNextListeners() {
    if (nextListeners === currentListeners) {
      nextListeners = currentListeners.slice()
    }
  }

  /**
   * 获取当前状态
   * @returns {any} 当前状态树
   */
  function getState() {
    // dispatch 执行中禁止调用此方法, 因为reducer中已经接受了state作为参数
    if (isDispatching) {
      throw new Error(
        'You may not call store.getState() while the reducer is executing. ' +
        'The reducer has already received the state as an argument. ' +
        'Pass it down from the top reducer instead of reading it from the store.'
      )
    }
    return currentState
  }

  /**
   *
   * 添加一个change监听函数, 他会在 action 被 dispatch 的时候触发(执行完reducer后触发), 状态树的某部分可能会发生变化.
   * 然后你可以在回调函数中调用 `getState()` 去读取当前状态树
   *
   * 你可能会在一个change监听中调用 `dispatch`, 注意以下忠告:
   * 1. 这些订阅是每个 `dispatch()`调用前的快照, 如果当监听正在被触发时你执行了订阅或者取消订阅,
   * 这不会对正在进行中的 `dispatch()` 产生任何影响. 但是无论是否嵌套, 下一个 `dispatch()` 会使用最近的订阅列表的快照
   *
   * 2. 监听不应期望看到所有的状态变更, 因为在调用监听之前, 在嵌套的 `dispatch()`中状态可能已经更新了多次.
   * 确保所有在 `dispatch()` 开始前注册的订阅在退出时会伴着最新的state调用
   *
   * @param {Function} listener  一个在每次 dispatch 都会被调用的回调函数
   * @returns {Function} 一个用来移除变化监听的函数
   */

  // 这个函数可以给 store 的状态添加订阅监听函数，一旦调用 `dispatch` ，所有的监听函数就会执行；
  // `nextListeners` 就是储存当前监听函数的列表，调用 `subscribe`，传入一个函数作为参数，那么就会给 `nextListeners` 列表 `push` 这个函数；
  // 同时调用 `subscribe` 函数会返回一个 `unsubscribe` 函数，用来解绑当前传入的函数，同时在 `subscribe` 函数定义了一个 `isSubscribed` 标志变量
  // 来判断当前的订阅是否已经被解绑，解绑的操作就是从 `nextListeners` 列表中删除当前的监听函数。

  function subscribe(listener) {
    if (typeof listener !== 'function') {
      throw new Error('Expected the listener to be a function.')
    }

    if (isDispatching) {
      throw new Error(
        'You may not call store.subscribe() while the reducer is executing. ' +
        'If you would like to be notified after the store has been updated, subscribe from a ' +
        'component and invoke store.getState() in the callback to access the latest state. ' +
        'See https://redux.js.org/api-reference/store#subscribe(lis`tener) for more details.'
      )
    }

    let isSubscribed = true

    ensureCanMutateNextListeners()
    nextListeners.push(listener)

    return function unsubscribe() {
      if (!isSubscribed) {
        return
      }

      if (isDispatching) {
        throw new Error(
          'You may not unsubscribe from a store listener while the reducer is executing. ' +
          'See https://redux.js.org/api-reference/store#subscribe(listener) for more details.'
        )
      }

      isSubscribed = false

      ensureCanMutateNextListeners()
      const index = nextListeners.indexOf(listener)
      nextListeners.splice(index, 1)
    }
  }

  // 这个函数是用来触发状态改变的，他接受一个 action 对象作为参数，然后 reducer 根据 action 的属性 以及 当前 store 的状态来生成一个新的状态，赋予当前状态，改变 store 的状态；
  // 即 `currentState = currentReducer(currentState, action)`；
  // 这里的 `currentReducer` 是一个函数，他接受两个参数：当前状态 和 action，然后返回计算出来的新的状态；
  // 然后遍历 `nextListeners` 列表，调用每个监听函数；
  function dispatch(action) {
    if (!isPlainObject(action)) {
      throw new Error('Actions must be plain objects. ' + 'Use custom middleware for async actions.')
    }

    if (typeof action.type === 'undefined') {
      throw new Error('Actions may not have an undefined "type" property. ' + 'Have you misspelled a constant?')
    }

    if (isDispatching) {
      throw new Error('Reducers may not dispatch actions.')
    }

    try {
      isDispatching = true
      currentState = currentReducer(currentState, action)
    } finally {
      isDispatching = false
    }

    const listeners = (currentListeners = nextListeners)
    for (let i = 0; i < listeners.length; i++) {
      const listener = listeners[i]
      listener()
    }

    return action
  }

  // 这个函数可以替换 store 当前的 reducer 函数，首先直接把 `currentReducer = nextReducer`，直接替换；
  // 然后 `dispatch({ type: ActionTypes.INIT })` ，用来初始化替换后 reducer 生成的初始化状态并且赋予 store 的状态；

  function replaceReducer(nextReducer) {
    if (typeof nextReducer !== 'function') {
      throw new Error('Expected the nextReducer to be a function.')
    }

    currentReducer = nextReducer
    dispatch({ type: ActionTypes.REPLACE })
  }

  // 可以使用observable订阅state修改的事件流, 我们一般用不到，它提供了给其他观察者模式／响应式库的交互操作
  // observable 功能的详细解释 https://juejin.im/post/6844903714998730766
  function observable() {
    const outerSubscribe = subscribe
    return {
      /**
       * The minimal observable subscription method.
       * @param observer Any object that can be used as an observer.
       * The observer object should have a `next` method.
       * @returns An object with an `unsubscribe` method that can
       * be used to unsubscribe the observable from the store, and prevent further
       * emission of values from the observable.
       */
      subscribe(observer) {
        if (typeof observer !== 'object' || observer === null) {
          throw new TypeError('Expected the observer to be an object.')
        }

        function observeState() {
          const observerAsObserver = observer
          if (observerAsObserver.next) {
            observerAsObserver.next(getState())
          }
        }

        observeState()
        const unsubscribe = outerSubscribe(observeState)
        return { unsubscribe }
      },

      [$$observable]() {
        return this
      }
    }
  }

  // 当一个store被创建, 一个"INIT" action 会被触发, 所以每个reducer 返回他们的初始值. 从而填充state树的初始值
  dispatch({ type: ActionTypes.INIT })

  return {
    dispatch,
    subscribe,
    getState,
    replaceReducer,
    [$$observable]: observable
  }
}
