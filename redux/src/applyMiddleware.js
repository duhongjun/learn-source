import compose from './compose'

/**
 * 为redux store 创建一组适用于 dispatch 方法的store增强器
 *
 * 因为中间件可能是异步的, 所以这会是组合链中的第一个store增强器
 *
 * 每个中间件都会收到 `dispatch` and `getState` 两个方法作为参数
 *
 * @param {...Function} middlewares The middleware chain to be applied.
 * @returns {Function} A store enhancer applying the middleware.
 */
export default function applyMiddleware(...middlewares) {
  return createStore => (...args) => {
    const store = createStore(...args)
    let dispatch = () => {
      throw new Error(
        `Dispatching while constructing your middleware is not allowed. ` +
          `Other middleware would not be applied to this dispatch.`
      )
    }

    const middlewareAPI = {
      getState: store.getState,
      dispatch: (...args) => dispatch(...args)
    }
    //  (store) => next => (action) => {}
    const chain = middlewares.map(middleware => middleware(middlewareAPI))
    // compose 方法将新的 middlewares 和 store.dispatch 结合起来，生成一个新的 dispatch 方法
    dispatch = compose(...chain)(store.dispatch)

    return {
      ...store,
      dispatch
    }
  }
}
