## selector

我们接着来看 `Connect`. 在读源码之前我们需要先知道一个名词: `selector`;
> 简单来说, selector 就是用于从 store 中获取所需数据的函数. 比如 connect参数 `mapStateToProps`、`mapDispatchToProps`

总的来说, `Connect` 函数的作用就是根据我们提供的 `selector`, 将我们需要的`state` 和 `dispatch` 注入到我们的组件中.
当然并不是直接使用我们传入的, 而是在内部使用 `selectorFactory` 经过了一系列的处理及优化. 

首先从我们使用的 `Connect` 函数开始, 源码文件对应路径为 `src/connect/connect.js`; 源码主要内容如下:

```javascript
import connectAdvanced from '../components/connectAdvanced'
import shallowEqual from '../utils/shallowEqual'
import defaultMapDispatchToPropsFactories from './mapDispatchToProps'
import defaultMapStateToPropsFactories from './mapStateToProps'
import defaultMergePropsFactories from './mergeProps'
import defaultSelectorFactory from './selectorFactory'

function match(arg, factories, name) {
  for (let i = factories.length - 1; i >= 0; i--) {
    const result = factories[i](arg)
    if (result) return result
  }

  return (dispatch, options) => {
    throw new Error(
      `Invalid value of type ${typeof arg} for ${name} argument when connecting component ${
        options.wrappedComponentName
      }.`
    )
  }
}

function strictEqual(a, b) {
  return a === b
}

export function createConnect({
  connectHOC = connectAdvanced,
  mapStateToPropsFactories = defaultMapStateToPropsFactories,
  mapDispatchToPropsFactories = defaultMapDispatchToPropsFactories,
  mergePropsFactories = defaultMergePropsFactories,
  selectorFactory = defaultSelectorFactory
} = {}) {
  return function connect(
    mapStateToProps,
    mapDispatchToProps,
    mergeProps,
    {
      pure = true,
      areStatesEqual = strictEqual,
      areOwnPropsEqual = shallowEqual,
      areStatePropsEqual = shallowEqual,
      areMergedPropsEqual = shallowEqual,
      ...extraOptions
    } = {}
  ) {
    const initMapStateToProps = match(
      mapStateToProps,
      mapStateToPropsFactories,
      'mapStateToProps'
    )
    const initMapDispatchToProps = match(
      mapDispatchToProps,
      mapDispatchToPropsFactories,
      'mapDispatchToProps'
    )
    const initMergeProps = match(mergeProps, mergePropsFactories, 'mergeProps')

    return connectHOC(selectorFactory, {
      methodName: 'connect',
      getDisplayName: name => `Connect(${name})`,
      shouldHandleStateChanges: Boolean(mapStateToProps),

      initMapStateToProps,
      initMapDispatchToProps,
      initMergeProps,
      pure,
      areStatesEqual,
      areOwnPropsEqual,
      areStatePropsEqual,
      areMergedPropsEqual,
      ...extraOptions
    })
  }
}

export default /*#__PURE__*/ createConnect()
```

可以看到整个文件导出的就是 `createConnect` 函数执行后的结果, 也就是函数内的 `connect` 的函数. 没错,这就是我们在项目里使用的 `connect` 函数. 回顾一下用法:

```javascript
connect(mapStateToProps, mapDispatchToProps)(Component)
```

给 createConnect 函数传入不同的参数可以生成不同的 connect 函数，用于我们的测试或者其他场景，在计算我们真正使用的 connect 函数时，使用到的全部都是默认参数; 也就是文件开头引入的四个 defaultFactory


接着可以看到, 内部使用 `match` 分别初始化了 `initMapStateToProps`、`initMapDispatchToProps` 和 `initMergeProps`.

```javascript
// 第一个参数是我们调用connect时传入的 mapStateToProps/mapDispatchToProps/mergeProps
// 第二个参数就是定义好的 defaultFactory, 是一个函数组成的数组
// 第三个参数是指定的函数名称, 用于报错信息展示
function match(arg, factories, name) {
  // 从右到左遍历defaultFactory, 将第一个参数传入, 如果返回值为真值, 就将返回值作为init函数
  // 格式为 (dispatch, options) => {return initConstantSelector || initProxySelector}
  for (let i = factories.length - 1; i >= 0; i--) {
    const result = factories[i](arg)
    if (result) return result
  }
  // 遍历完还没有一个合格的, 就返回一个报错函数, 提示我们传入的 mapXXXToProps/mergeProps 不合法.
  return (dispatch, options) => {
    throw new Error(
      `Invalid value of type ${typeof arg} for ${name} argument when connecting component ${
        options.wrappedComponentName
      }.`
    )
  }
}
```

我们看一下 `defaultMapStateToPropsFactories` 和 `defaultMapDispatchToPropsFactories` 的代码实现:

```javascript
  // defaultMapDispatchToPropsFactories
  import { bindActionCreators } from 'redux'
  import { wrapMapToPropsConstant, wrapMapToPropsFunc } from './wrapMapToProps'

  export function whenMapDispatchToPropsIsFunction(mapDispatchToProps) {
    return typeof mapDispatchToProps === 'function'
      ? wrapMapToPropsFunc(mapDispatchToProps, 'mapDispatchToProps')
      : undefined
  }

  export function whenMapDispatchToPropsIsMissing(mapDispatchToProps) {
    // 没传给个默认值, 只注入dispatch
    return !mapDispatchToProps
      ? wrapMapToPropsConstant(dispatch => ({ dispatch }))
      : undefined
  }

  export function whenMapDispatchToPropsIsObject(mapDispatchToProps) {
    return mapDispatchToProps && typeof mapDispatchToProps === 'object'
      ? wrapMapToPropsConstant(dispatch =>
          bindActionCreators(mapDispatchToProps, dispatch)
        )
      : undefined
  }

  export default [
    whenMapDispatchToPropsIsFunction,
    whenMapDispatchToPropsIsMissing,
    whenMapDispatchToPropsIsObject
  ]

  // defaultMapStateToPropsFactories
  import { wrapMapToPropsConstant, wrapMapToPropsFunc } from './wrapMapToProps'

  export function whenMapStateToPropsIsFunction(mapStateToProps) {
    return typeof mapStateToProps === 'function'
      ? wrapMapToPropsFunc(mapStateToProps, 'mapStateToProps')
      : undefined
  }

  export function whenMapStateToPropsIsMissing(mapStateToProps) {
    // 没传给个默认值
    return !mapStateToProps ? wrapMapToPropsConstant(() => ({})) : undefined
  }

  export default [whenMapStateToPropsIsFunction, whenMapStateToPropsIsMissing]
```

可以看出其实就是根据我们调用`connect`时传入的参数类型做处理. 这里用到了 `wrapMapToProps` 文件里的两个方法:

1. wrapMapToPropsConstant
```javascript
export function wrapMapToPropsConstant(getConstant) {
  return function initConstantSelector(dispatch, options) {
    const constant = getConstant(dispatch, options)
    function constantSelector() {
      return constant
    }
    // 不依赖组件自身的props
    constantSelector.dependsOnOwnProps = false
    // 返回constantSelector
    return constantSelector
  }
}
```

结合前面 `defaultFactory` 的调用来看, 这个函数使用的场景有以下几种:

* 传入的 `mapStateToProps` 为 `null` 或 `undefined`, 也就是我们的组件不需要订阅任何store里面的值的时候
* 没传 `mapDispatchToProps` 或者 传的为假值, 返回只包含 `dispatch` 的对象
* 传的 `mapDispatchToProps` 为一个对象, 则通过使用 redux 的 `bindActionCreator` 处理成一个对象

2. wrapMapToPropsFunc
```javascript
// 获取 是否依赖组件自身的props
export function getDependsOnOwnProps(mapToProps) {
  return mapToProps.dependsOnOwnProps !== null &&
    mapToProps.dependsOnOwnProps !== undefined
    ? Boolean(mapToProps.dependsOnOwnProps)
    : mapToProps.length !== 1
}

export function wrapMapToPropsFunc(mapToProps, methodName) {
  // 最终返回一个 proxy 函数, 会在connectAdvanced中当做参数的一部分传递给selectorFactory, 生成最终的selector
  return function initProxySelector(dispatch, { displayName }) {
    // 定义一个proxy函数, 调用时通过mapToProps方法获取props
    const proxy = function mapToPropsProxy(stateOrDispatch, ownProps) {
      return proxy.dependsOnOwnProps
        ? proxy.mapToProps(stateOrDispatch, ownProps)
        : proxy.mapToProps(stateOrDispatch)
    }

    // 默认值, 依赖组件自身的props
    proxy.dependsOnOwnProps = true

    // 定义获取props的方法
    proxy.mapToProps = function detectFactoryAndVerify(
      stateOrDispatch,
      ownProps
    ) {
      // 重新赋值为我们传入的mapToProps
      proxy.mapToProps = mapToProps
      // 更新是否依赖组件自身的props
      proxy.dependsOnOwnProps = getDependsOnOwnProps(mapToProps)
      // 现在执行proxy, mapToProps已经被替换为我们传入的了
      let props = proxy(stateOrDispatch, ownProps)

      // 如果mapToProps的返回值为函数, 接着执行这个函数
      if (typeof props === 'function') {
        proxy.mapToProps = props
        proxy.dependsOnOwnProps = getDependsOnOwnProps(props)
        props = proxy(stateOrDispatch, ownProps)
      }

      return props
    }

    return proxy
  }
}
```

生成了`selector`之后, 它们作为参数传递给了 `connectAdvanced`, 我们接下来看看它是怎么执行的,相关的主要代码如下:

```javascript
export default function connectAdvanced(
  selectorFactory,
  {
    renderCountProp = undefined,
    storeKey = 'store',
    withRef = false,
    getDisplayName = name => `ConnectAdvanced(${name})`,
    methodName = 'connectAdvanced',
    shouldHandleStateChanges = true,
    forwardRef = false,
    context = ReactReduxContext,
    ...connectOptions
  } = {}
) {

  const Context = context

  return function wrapWithConnect(WrappedComponent) {

    // 我们上面说到的selector 都在connectOptions 中
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
    // 为true时, 只有state或者ownProps变动的时候，重新计算生成selector
    const { pure } = connectOptions

    // 调用selectorFactory, 返回selector 
    function createChildSelector(store) {
      return selectorFactory(store.dispatch, selectorFactoryOptions)
    }

    const usePureOnlyMemo = pure ? useMemo : callback => callback()

    function ConnectFunction(props) {

      // 只有store变化时, 重新创建selector
      const childPropsSelector = useMemo(() => {
        return createChildSelector(store)
      }, [store])

      // 实际上要注入到组件的props, 也就是调用selector的返回值
      const actualChildProps = usePureOnlyMemo(() => {
        return childPropsSelector(store.getState(), wrapperProps)
      }, [store, previousStateUpdateResult, wrapperProps])

      // 将props注入到组件中
      const renderedWrappedComponent = useMemo(
        () => (
          <WrappedComponent
            {...actualChildProps}
            ref={reactReduxForwardedRef}
          />
        ),
        [reactReduxForwardedRef, WrappedComponent, actualChildProps]
      )

      // 最终要渲染的组件
      const renderedChild = useMemo(() => {
        if (shouldHandleStateChanges) {
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

    const Connect = pure ? React.memo(ConnectFunction) : ConnectFunction
    // 拷贝除react属性外的静态属性到最终的高阶组件上, 并将最终的组件返回
    return hoistStatics(Connect, WrappedComponent)
  }
}
```

一鼓作气, 接着看下 `selectorFactory` 的实现, 对应文件为 `src/connect/selectorFactory.js`, 源码如下:

```javascript
// 就是外部使用的 selectorFactory, 
export default function finalPropsSelectorFactory(
  dispatch,
  { initMapStateToProps, initMapDispatchToProps, initMergeProps, ...options }
) {
  //  这里三个init方法是wrapMapToProps.js中处理后的格式
  // 调用后, mapStateToProps/mapDispatchToProps 现在就是 constantSelector 或者 proxy
  const mapStateToProps = initMapStateToProps(dispatch, options)
  const mapDispatchToProps = initMapDispatchToProps(dispatch, options)
  const mergeProps = initMergeProps(dispatch, options)
  // 根据pure的值 选择对应的 selectorFactory
  const selectorFactory = options.pure
    ? pureFinalPropsSelectorFactory
    : impureFinalPropsSelectorFactory

  // 调用
  return selectorFactory(
    mapStateToProps,
    mapDispatchToProps,
    mergeProps,
    dispatch,
    options
  )
}

// 不带缓存的 selector
export function impureFinalPropsSelectorFactory(
  mapStateToProps,
  mapDispatchToProps,
  mergeProps,
  dispatch
) {
  return function impureFinalPropsSelector(state, ownProps) {
    // 合并三种props
    return mergeProps(
      mapStateToProps(state, ownProps),
      mapDispatchToProps(dispatch, ownProps),
      ownProps
    )
  }
}

// 带缓存的selector
export function pureFinalPropsSelectorFactory(
  mapStateToProps,
  mapDispatchToProps,
  mergeProps,
  dispatch,
  { areStatesEqual, areOwnPropsEqual, areStatePropsEqual }
) {
  // 是否执行过的标识
  let hasRunAtLeastOnce = false
  let state
  let ownProps
  let stateProps
  let dispatchProps
  let mergedProps

  // 第一次执行时调用, 调用mapStateToProps, mapDispatchToProps, mergeProps, 并赋值, 返回合并后的最终props
  function handleFirstCall(firstState, firstOwnProps) {
    state = firstState
    ownProps = firstOwnProps
    stateProps = mapStateToProps(state, ownProps)
    dispatchProps = mapDispatchToProps(dispatch, ownProps)
    mergedProps = mergeProps(stateProps, dispatchProps, ownProps)
    hasRunAtLeastOnce = true
    return mergedProps
  }
  /**
      后续调用执行的, 即调用次数大于 1 后, 需要再内部判断 state 和 store 是否发生变化
      分为三种情况: props和store的state都发生了变化/props发生了变化/store-state发生了变化
      根据变化的不同情况调用不同的方法. 如果没有变化, 直接返回之前的mergedProps, 即合并后完整的props
   */
  function handleSubsequentCalls(nextState, nextOwnProps) {
    const propsChanged = !areOwnPropsEqual(nextOwnProps, ownProps)
    const stateChanged = !areStatesEqual(nextState, state)
    state = nextState
    ownProps = nextOwnProps

    if (propsChanged && stateChanged) return handleNewPropsAndNewState()
    if (propsChanged) return handleNewProps()
    if (stateChanged) return handleNewState()
    return mergedProps
  }

  // 后续调用时, props 和 store的state都变化时调用
  function handleNewPropsAndNewState() {
    stateProps = mapStateToProps(state, ownProps)

    if (mapDispatchToProps.dependsOnOwnProps)
      dispatchProps = mapDispatchToProps(dispatch, ownProps)

    mergedProps = mergeProps(stateProps, dispatchProps, ownProps)
    return mergedProps
  }
  // 后续调用时, props 变化时调用
  function handleNewProps() {
    if (mapStateToProps.dependsOnOwnProps)
      stateProps = mapStateToProps(state, ownProps)

    if (mapDispatchToProps.dependsOnOwnProps)
      dispatchProps = mapDispatchToProps(dispatch, ownProps)

    mergedProps = mergeProps(stateProps, dispatchProps, ownProps)
    return mergedProps
  }
  // 后续调用时, state 变化时调用
  function handleNewState() {
    const nextStateProps = mapStateToProps(state, ownProps)
    const statePropsChanged = !areStatePropsEqual(nextStateProps, stateProps)
    stateProps = nextStateProps

    if (statePropsChanged)
      mergedProps = mergeProps(stateProps, dispatchProps, ownProps)

    return mergedProps
  }
  // 返回 pure 模式下最终的selector, 执行后返回最终的props
  return function pureFinalPropsSelector(nextState, nextOwnProps) {
    // 区分首次和后续调用
    return hasRunAtLeastOnce
      ? handleSubsequentCalls(nextState, nextOwnProps)
      : handleFirstCall(nextState, nextOwnProps)
  }
}
```

至此, `selector` 的完整流程已经弄清楚了, 我们从头再梳理一下流程:

TODO: 图片

## 如何更新

我们已经搞清楚了如何获取, 接下来我们回到 `connectAdvanced` 中看看是如何更新的.

先解释下两个名词:

* child props: 通过selector得到的, 最终要传递给我们组件的props, 包括父级传入的, store的state, dispatch等.
* wrapper props: 父级传入的props

```javascript
import React, { useContext, useMemo, useRef, useReducer } from 'react'
import { isContextConsumer } from 'react-is'
import Subscription from '../utils/Subscription'
import { useIsomorphicLayoutEffect } from '../utils/useIsomorphicLayoutEffect'
import { ReactReduxContext } from './Context'

// 定义一些常量数组, 避免重复创建它们
const EMPTY_ARRAY = []
const NO_SUBSCRIPTION_ARRAY = [null, null]

// 内部使用的reducer, 用于props变化时重新render组件
function storeStateUpdatesReducer(state, action) {
  const [, updateCount] = state
  return [action.payload, updateCount + 1]
}

// 用传入的参数声明一个effect, ssr时用的 useEffect, 其他情况时 useLayoutEffect
// 在服务端(应该是指SSR)使用useLayoutEffect时, React 会发出警告
// 为了解决这个问题, 需要在服务端使用useEffect(空函数), 浏览器端使用 useLayoutEffect
// 我们需要 useLayoutEffect 来确保 store subscription 回调里总是可以 获取到 来自最新一次render, commit阶段的 selector
// 否则 一个 store 的更新可能处于 render 和 effect 之间, 这样可能导致丢失更新;
// 我们也必须保证store 的 subscription 同步创建, 否则一个 store 的更新可能在 subscription 创建前发生, 并且可能观察到不一致的状态
// 注: useLayoutEffect 会在DOM变动后立即同步执行, 会阻塞渲染
function useIsomorphicLayoutEffectWithArgs(effectFunc,effectArgs,dependencies) {
  useIsomorphicLayoutEffect(() => effectFunc(...effectArgs), dependencies)
}

function captureWrapperProps(
  lastWrapperProps,
  lastChildProps,
  renderIsScheduled,
  wrapperProps,
  actualChildProps,
  childPropsFromStoreUpdate,
  notifyNestedSubs
) {
  // 使用useRef存储的三个值, 用处是存储 wrapper props和 child props, 后面比较时会用到
  lastWrapperProps.current = wrapperProps
  lastChildProps.current = actualChildProps
  renderIsScheduled.current = false

  // store state 发生变化时, 会将childPropsFromStoreUpdate.current 置为新的 childProps
  // 所以这里判断是 child props变化, 重置为null并通知自身的所有订阅者
  // 触发时机在 checkForUpdates 中
  if (childPropsFromStoreUpdate.current) {
    childPropsFromStoreUpdate.current = null
    notifyNestedSubs()
  }
}


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
  // 如果没有订阅store的变化, 直接return 啥也不用干
  if (!shouldHandleStateChanges) return

  let didUnsubscribe = false
  let lastThrownError = null

  // 每当一个store的的订阅更新传播到这个组件, 我们都会执行这个回调
  const checkForUpdates = () => {
    // 取消订阅后, 这个值会被置为true
    if (didUnsubscribe) {
      return
    }

    const latestStoreState = store.getState()

    let newChildProps, error
    try {
      // 用最新的state和wrapper props运行selector, 得到最新的child props
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

    // 如果 child 的props没有变化, 啥也不做, 通知子级订阅更新
    if (newChildProps === lastChildProps.current) {
      if (!renderIsScheduled.current) {
        notifyNestedSubs()
      }
    } else {
      // 如果变化了, 存储新 child props的引用. 注意我们使用ref记录而不是 useState/useReducer
      // 因为我们需要有一个方式来确定这个值是否被处理过.
      // 如果使用了 useState/useReducer, 如果不重新渲染，无法清除这个值
      lastChildProps.current = newChildProps
      childPropsFromStoreUpdate.current = newChildProps
      renderIsScheduled.current = true
      // 如果 child props 变化了(或者捕获到了错误), 这个包装组件需要重新render
      forceComponentUpdateDispatch({
        type: 'STORE_UPDATED',
        payload: {
          error
        }
      })
    }
  }

  // 绑定监听函数, 进行订阅
  subscription.onStateChange = checkForUpdates
  subscription.trySubscribe()

  // Pull data from the store after first render in case the store has
  // changed since we began.
  // 第一次render后从store中拉取数据, 防止
  checkForUpdates()

  // 解绑函数
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
```

