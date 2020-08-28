import hoistStatics from 'hoist-non-react-statics'
import React, { useContext, useMemo, useRef, useReducer } from 'react'
import { isContextConsumer } from 'react-is'
import Subscription from '../utils/Subscription'
import { useIsomorphicLayoutEffect } from '../utils/useIsomorphicLayoutEffect'

import { ReactReduxContext } from './Context'

// 定义一些常量数组, 避免重复创建它们
const EMPTY_ARRAY = []
const NO_SUBSCRIPTION_ARRAY = [null, null]

// 用于重新渲染组件的内置reducer
function storeStateUpdatesReducer(state, action) {
  const [, updateCount] = state
  return [action.payload, updateCount + 1]
}

/**
  用传入的参数声明一个effect, ssr时用的 useEffect, 其他情况时 useLayoutEffect
 */
function useIsomorphicLayoutEffectWithArgs(
  effectFunc,
  effectArgs,
  dependencies
) {
  useIsomorphicLayoutEffect(() => effectFunc(...effectArgs), dependencies)
}

/**
 * 每次render都触发,将最新的wrapper props和child props存储在ref上,在其他地方比较时使用
 * 如果此次更新源于store更新, 会通知子级订阅者
 */
function captureWrapperProps(
  lastWrapperProps,
  lastChildProps,
  renderIsScheduled,
  wrapperProps,
  actualChildProps,
  childPropsFromStoreUpdate,
  notifyNestedSubs
) {
  lastWrapperProps.current = wrapperProps
  lastChildProps.current = actualChildProps
  renderIsScheduled.current = false

  // 如果这次 render 是来自 store 更新, 清除引用并通知子级订阅者
  if (childPropsFromStoreUpdate.current) {
    childPropsFromStoreUpdate.current = null
    notifyNestedSubs()
  }
}

// 实现订阅逻辑, 只有在store 或者context值变化时才重新执行
function subscribeUpdates(
  shouldHandleStateChanges,
  store,
  subscription,
  childPropsSelector,
  lastWrapperProps,
  lastChildProps,
  renderIsScheduled,
  childPropsFromStoreUpdate,
  notifyNestedSubs,
  forceComponentUpdateDispatch
) {
  // 如果没有订阅store, 啥也不用干
  if (!shouldHandleStateChanges) return

  let didUnsubscribe = false
  let lastThrownError = null

  // 每当一个store的的订阅更新传播到这个组件, 我们都会执行这个回调
  const checkForUpdates = () => {
    // 取消订阅时, 这个值会被置为true, 就不走下面的逻辑了
    if (didUnsubscribe) {
      return
    }
    // 1. 获取最新的store数据
    const latestStoreState = store.getState()

    let newChildProps, error

    // 2. 使用最近一次的store数据 和 wrapper props 来运行 selector, 得到新的child props
    try {
      newChildProps = childPropsSelector(
        latestStoreState,
        lastWrapperProps.current
      )
    } catch (e) {
      error = e
      lastThrownError = e
    }

    if (!error) {
      lastThrownError = null
    }

    // 3.1 将第二步得到的最新child props和上次的进行比较. 如果没有变化, 这里啥也不做, 直接通知子级订阅更新
    if (newChildProps === lastChildProps.current) {
      if (!renderIsScheduled.current) {
        notifyNestedSubs()
      }
    } else {
      // 3.2 如果变化了(或者捕获到了错误), 存储新child props的引用; 同时执行reducer更新组件
      lastChildProps.current = newChildProps
      childPropsFromStoreUpdate.current = newChildProps
      renderIsScheduled.current = true

      forceComponentUpdateDispatch({
        type: 'STORE_UPDATED',
        payload: {
          error
        }
      })
    }
  }

  // 执行订阅逻辑, state 变化时将执行上面定义的 checkForUpdates 函数
  subscription.onStateChange = checkForUpdates
  subscription.trySubscribe()

  // Pull data from the store after first render in case the store has
  // changed since we began.
  // 在第一次渲染后直接执行一次, 防止store从一开始就改变了
  checkForUpdates()

  // 解除订阅函数
  const unsubscribeWrapper = () => {
    didUnsubscribe = true
    subscription.tryUnsubscribe()
    subscription.onStateChange = null

    if (lastThrownError) {
      throw lastThrownError
    }
  }

  return unsubscribeWrapper
}

const initStateUpdates = () => [null, 0]

export default function connectAdvanced(
  /*
    selectorFactory 负责返回 selector 函数, 这个函数用于计算从 state、props和dispatch中计算出新的props, 举个例子:

      export default connectAdvanced((dispatch, options) => (state, props) => ({
        thing: state.things[props.thingId],
        saveThing: fields => dispatch(actionCreators.saveThing(props.thingId, fields)),
      }))(YourComponent) 

      给这个 factory 提供了访问 dispatch的能力, 所以 selectorFactories 可以在他们的 selector 外 绑定 actionCreators 作为一个优化.
      第二个参数会和 displayName以及WrappedComponent 一起被传递给 connectAdvanced作为参数.

      注意 selectorFactory 负责所有的进出props的缓存/记忆.
      在调用 selector的时候, 不要在没有设置缓存/记忆的情况下直接使用 connectAdvanced
      否则 Connect 了的组件会在每个 state 或者 props变化的时候 重新render
   */
  selectorFactory,
  {
    // REMOVED: 用来记录render的次数, 现在已经没用了
    renderCountProp = undefined,
    // REMOVED: 获取store的key, 现在也没用了
    storeKey = 'store',
    // REMOVED: 使用ref暴露包装组件, 现在也没用了
    withRef = false,

    // 根据被包裹组件的 displayName 计算出这个 HOC 的 displayName
    getDisplayName = name => `ConnectAdvanced(${name})`,
    // 下面报错信息时使用的
    methodName = 'connectAdvanced',
    // 是否监听store中state的变化
    shouldHandleStateChanges = true,
    // 将我们在容器组件上设置的 ref 属性通过 React.forwardRef API 转交给内部的组件。
    forwardRef = false,
    // context
    context = ReactReduxContext,
    // 其他selectorFactory会用到的参数
    ...connectOptions
  } = {}
) {

  const Context = context

  return function wrapWithConnect(WrappedComponent) {

    const wrappedComponentName =
      WrappedComponent.displayName || WrappedComponent.name || 'Component'

    const displayName = getDisplayName(wrappedComponentName)

    const selectorFactoryOptions = {
      ...connectOptions,
      getDisplayName,
      methodName,
      renderCountProp,
      shouldHandleStateChanges,
      storeKey,
      displayName,
      wrappedComponentName,
      WrappedComponent
    }

    const { pure } = connectOptions

    // 创建selector
    function createChildSelector(store) {
      return selectorFactory(store.dispatch, selectorFactoryOptions)
    }

    // 如果不是 pure 模式, 就不用对值进行缓存
    const usePureOnlyMemo = pure ? useMemo : callback => callback()

    function ConnectFunction(props) {
      const [
        propsContext,
        reactReduxForwardedRef,
        wrapperProps
      ] = useMemo(() => {
        // 区分传递给包装组件的实际 data props 和 需要控制行为的 值 (在这就是 forwarded refs)
        // 为了维护 wrapperProps 的对象引用, 缓存这个解构值
        const { reactReduxForwardedRef, ...wrapperProps } = props
        return [props.context, reactReduxForwardedRef, wrapperProps]
      }, [props])

      // 用户可能会传入一个自定义的 context 实例而不是使用 react-redux 内部定义的context
      // 在这缓存应该用哪个 context的实例, 后面直接用这个值就行了
      const ContextToUse = useMemo(() => {
        return propsContext &&
          propsContext.Consumer &&
          isContextConsumer(<propsContext.Consumer />)
          ? propsContext
          : Context
      }, [propsContext, Context])

      const contextValue = useContext(ContextToUse)

      const didStoreComeFromProps =
        Boolean(props.store) &&
        Boolean(props.store.getState) &&
        Boolean(props.store.dispatch)

      // 基于之前的检索, 要么用props的store, 要么用 context中的store
      const store = didStoreComeFromProps ? props.store : contextValue.store

      // child props 筛选器需要依赖于store, 当store变化时, 重建筛选器
      const childPropsSelector = useMemo(() => {
        return createChildSelector(store)
      }, [store])

      const [subscription, notifyNestedSubs] = useMemo(() => {
        // 如果不需要订阅store的state, 返回一个固定的值
        if (!shouldHandleStateChanges) return NO_SUBSCRIPTION_ARRAY

        // 如果store是从context取的, 将其当做parentSub, 将订阅挂载在parentSub下 
        const subscription = new Subscription(
          store,
          didStoreComeFromProps ? null : contextValue.subscription
        )

        const notifyNestedSubs = subscription.notifyNestedSubs.bind(
          subscription
        )

        return [subscription, notifyNestedSubs]
      }, [store, didStoreComeFromProps, contextValue])

      // 重写后的 Context 值, 使用useMemo做缓存, 同时根据 store的来源做区分处理
      const overriddenContextValue = useMemo(() => {
        if (didStoreComeFromProps) {
          // 这个组件是直接订阅的props中的store
          // 我们不想子节点读取这个store - 无论现有 context 值是否来自最近已经 connect的祖先, 都将其传递下去
          return contextValue
        }

        // store 来自 context
        // 将这个组件的 订阅实例放进context, 这样 connect 的子节点不会更新直到这个组件完成
        return {
          ...contextValue,
          subscription
        }
      }, [didStoreComeFromProps, contextValue, subscription])

      // 当 Redux store 更新导致一个已经计算过props的子组件发生变化(或者我们在mapState中捕获到了错误), 我们需要强制这个wrapper组件重新render
      const [
        [previousStateUpdateResult],
        forceComponentUpdateDispatch
      ] = useReducer(storeStateUpdatesReducer, EMPTY_ARRAY, initStateUpdates)

      if (previousStateUpdateResult && previousStateUpdateResult.error) {
        throw previousStateUpdateResult.error
      }

      // 设置 refs 存储值, 保证在订阅和render中都能拿到准确的值
      const lastChildProps = useRef()
      const lastWrapperProps = useRef(wrapperProps)
      const childPropsFromStoreUpdate = useRef()
      const renderIsScheduled = useRef(false)

      // 获取当前的child props
      const actualChildProps = usePureOnlyMemo(() => {
        // 这里的逻辑:
        // 这个 render 可能被一个产生新 child props 的store更新所触发
        // 但是, 我们可能在那之后得到新的 wrapper props
        // 如果我们得到了新的 child props, 且 wrapper props相同, 直接按原样使用新的 child props
        // 如果得到了新的 wrapper props, 他们可能会改变 child props, 所以我们必须重新进行计算
        if (
          childPropsFromStoreUpdate.current &&
          wrapperProps === lastWrapperProps.current
        ) {
          return childPropsFromStoreUpdate.current
        }

        return childPropsSelector(store.getState(), wrapperProps)
      }, [store, previousStateUpdateResult, wrapperProps])

      // 每次render都触发, 将最新的wrapper props 和 child props存储在ref上, 同时, 如果这次 render 是来自 store 更新, 通知子级订阅者
      useIsomorphicLayoutEffectWithArgs(captureWrapperProps, [
        lastWrapperProps,
        lastChildProps,
        renderIsScheduled,
        wrapperProps,
        actualChildProps,
        childPropsFromStoreUpdate,
        notifyNestedSubs
      ])

      // 重新订阅的逻辑只有在 store 或者context值变化时才重新执行
      useIsomorphicLayoutEffectWithArgs(
        subscribeUpdates,
        [
          shouldHandleStateChanges,
          store,
          subscription,
          childPropsSelector,
          lastWrapperProps,
          lastChildProps,
          renderIsScheduled,
          childPropsFromStoreUpdate,
          notifyNestedSubs,
          forceComponentUpdateDispatch
        ],
        [store, subscription, childPropsSelector]
      )

      // render 我们的组件, 使用useMemo做缓存优化
      const renderedWrappedComponent = useMemo(
        () => (
          <WrappedComponent
            {...actualChildProps}
            ref={reactReduxForwardedRef}
          />
        ),
        [reactReduxForwardedRef, WrappedComponent, actualChildProps]
      )

      const renderedChild = useMemo(() => {
        if (shouldHandleStateChanges) {
          // 如果这个组件订阅了store更新, 需要把它的subscription实例放在context中向下传递给子级
          // 
          // That means rendering the same
          // Context instance, and putting a different value into the context.
          return (
            <ContextToUse.Provider value={overriddenContextValue}>
              {renderedWrappedComponent}
            </ContextToUse.Provider>
          )
        }

        return renderedWrappedComponent
      }, [ContextToUse, renderedWrappedComponent, overriddenContextValue])

      return renderedChild
    }







    // 如果是 pure 模式, 确保只有传入的props变化时才重新render包装组件
    const Connect = pure ? React.memo(ConnectFunction) : ConnectFunction

    Connect.WrappedComponent = WrappedComponent
    Connect.displayName = displayName

    if (forwardRef) {
      const forwarded = React.forwardRef(function forwardConnectRef(
        props,
        ref
      ) {
        return <Connect {...props} reactReduxForwardedRef={ref} />
      })

      forwarded.displayName = displayName
      forwarded.WrappedComponent = WrappedComponent
      return hoistStatics(forwarded, WrappedComponent)
    }

    return hoistStatics(Connect, WrappedComponent)
  }
}
