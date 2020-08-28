import connectAdvanced from '../components/connectAdvanced'
import shallowEqual from '../utils/shallowEqual'
import defaultMapDispatchToPropsFactories from './mapDispatchToProps'
import defaultMapStateToPropsFactories from './mapStateToProps'
import defaultMergePropsFactories from './mergeProps'
import defaultSelectorFactory from './selectorFactory'

/*
  connect 是 connectAdvanced 的表象. 它把接收的参数变成一个兼容的selectorFactory, 格式如下:

    (dispatch, options) => (nextState, nextOwnProps) => nextFinalProps

  每次当一个 Connect 组件实例化或者热更新时, connect 函数把它接收的参数传递给 connectAdvanced 做选项, 用来依次传递给 selectorFactory

  selectorFactory 返回一个最终的 props selector, 利用它的 mapStateToProps,  mapStateToPropsFactories, mapDispatchToProps, mapDispatchToPropsFactories, mergeProps,
  mergePropsFactories 以及 pure 参数

  每当 Connect 组件的实例接收到新的props或者 store的state,  最终得到的 props selector 都会被调用
*/
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

// 给 createConnect 函数传入不同的参数可以生成不同的 connect 函数，用于我们的测试或者其他场景，在计算我们真正使用的 connect 函数时，使用到的全部都是默认参数;
// 默认导出 createConnect(), 所以直接看defaultFactory的实现即可
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
      // 如果mapStateToProps为假值, 说明不依赖store的值, 也就不需要订阅store state的变化
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
