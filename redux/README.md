## Redux 整体概览

- 创建一个 store 来存放 state
- 根据 reducer 的初始值填充默认 store
- 通过调用 dispatch 触发 action,然后由对应的 reducer 进行处理, 完成 state 的更新
- 可以通过 subscribe 添加监听函数,每当调用 dispatch 时, 会执行所有的监听函数
- 可以通过添加 middleware 来对 dispacth 进行增强, 实现各种想要的功能

然后我们看一下源码的目录结构:

![image](https://user-images.githubusercontent.com/18900868/45730291-704fc580-bc03-11e8-93c0-89f8c5f32891.png)

看起来确实也没有多少, 接下来我们一个一个看

## createStore

大致的结构如下(省略了一些很好理解的参数判断/抛错逻辑)

```javascript
function createStore(reducer, preloadedState, enhancer) {

  if (typeof enhancer !== 'undefined') {
    // 会和applyMiddleware一起说
    return enhancer(createStore)(reducer, preloadedState)
  }

  let currentReducer = reducer
  let currentState = preloadedState
  let currentListeners = []
  let nextListeners = currentListeners
  let isDispatching = false

  // 获取当前state
  function getState() {
    // ...
  }
  // 增加监听函数, 每当调用dispatch时会触发
  function subscribe(listener) {
    // ...
  }
  // 触发一个action, 执行对应的reducer更新state,并且执行所有通过`subscribe`注册的监听函数
  function dispatch(action) {
    // ...
  }

  // 替换当前的reducer
  function replaceReducer(nextReducer) {
    // ...
  }

  // 可以使用observable订阅state修改的事件流, 我们一般用不到，它提供了给其他观察者模式／响应式库的交互操作
  // observable 功能的详细解释 https://juejin.im/post/6844903714998730766
  function observable() {
    // ...
  }

  // 当一个store被创建, 一个"INIT" action会被触发,
  // 所以每个reducer 返回他们的初始值从而填充state树
  dispatch({ type: ActionTypes.INIT })

  return {
    dispatch,
    subscribe,
    getState,
    replaceReducer,
    [$$observable]: observable
  }
```

1. getState

```javascript
function getState() {
  // 没啥好说的..
  return currentState
}
```

2. dispatch

> 执行 reducer, 更新 state, 然后遍历执行所有通过`subscribe`注册过的监听函数

```javascript
function dispatch(action) {
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
```

3. subscribe

> 内部有一个`isSubscribed`变量标识是否已经订阅,将监听函数放入`nextListeners`, 返回一个`unsubscribe`函数用于解绑, 需要注意的是无论绑定还是解绑都是在下次`dispatch`触发时才会生效

```javascript
// 先判断是否是同一个引用, 如果是会先进行拷贝
function ensureCanMutateNextListeners() {
  if (nextListeners === currentListeners) {
    nextListeners = currentListeners.slice()
  }
}

function subscribe(listener) {
  let isSubscribed = true

  ensureCanMutateNextListeners()
  nextListeners.push(listener)

  return function unsubscribe() {
    if (!isSubscribed) {
      return
    }
    isSubscribed = false

    ensureCanMutateNextListeners()
    const index = nextListeners.indexOf(listener)
    nextListeners.splice(index, 1)
  }
}
```

4. replaceReducer

> 替换`reducer`, 并触发一个`REPLACE` action, 更新 store 的初始值

```javascript
function replaceReducer(nextReducer) {
  currentReducer = nextReducer
  dispatch({ type: ActionTypes.REPLACE })
}
```

## combineReducers

> 我们通常是将 reducer 分模块编写, 最后使用这个 API 将多个 reducer 组合成一个, 然后传入`createStore`

主要结构如下:

```JavaScript
// 当触发一个action并执行reducer后有任何key对应的state值为undefined的时, 抛出一个Error
function getUndefinedStateErrorMessage(key, action) {
  // ...
}
// 遍历传入的state的key, 如果组合过的reducer中不包含对应的key, 抛出warning
function getUnexpectedStateShapeWarningMessage(inputState, reducers, action, unexpectedKeyCache) {
  // ...
}
/**
 * 1. 遍历执行所有的reducer, 传入`INIT`action 和 值为undefined 的state 作为初始值 ,
如果返回的state值是undefined, 说明没有"设置初始state", 抛出异常
 * 2. 如果第一步没问题, 会接着再调用一次reducer, 传入一个随机的action type 和
值为undefined的state作为初始值, 如果返回值为undefined, 说明没有遵守
`遇到未知的 action 时，一定要返回旧的 state`的约定, 抛出异常
 **/
function assertReducerShape(reducers){
  // ...
}

/**
 * 合并传入的reducer对象, 返回一个新的 reducer 函数给 `createStore` 使用。
 */
export default function combineReducers(reducers) {
  // ...
}
```

下面说说`combineReducers`这个方法

> 1. 首先是遍历传入的 reducers 对象, 然后以同样的 key 赋值给`finalReducers`, 值就是对应的 reducer 函数.
> 2. 调用`assertReducerShape`方法判断每个 reducer 是否符合基本规约
> 3. 返回一个标准的 reducer 函数，接受一个 state 和 action 参数
> 4. 每次调用 dispatch 时, 都会去遍历`finalReducers`, 获得当前 key 对应的`nextState`, 如果当前 state 和 nextState 不同, 将 hasChanged 标记置为 true,返回完整的 nextState,否则返回当前 state 即可.

```javascript
function combineReducers(reducers) {
  const reducerKeys = Object.keys(reducers)
  const finalReducers = {}
  // 遍历赋值
  for (let i = 0; i < reducerKeys.length; i++) {
    const key = reducerKeys[i]
    if (typeof reducers[key] === 'function') {
      finalReducers[key] = reducers[key]
    }
  }
  const finalReducerKeys = Object.keys(finalReducers)

  let unexpectedKeyCache
  if (process.env.NODE_ENV !== 'production') {
    unexpectedKeyCache = {}
  }

  let shapeAssertionError
  try {
    // 判断reducer是否符合规范
    assertReducerShape(finalReducers)
  } catch (e) {
    shapeAssertionError = e
  }

  return function combination(state = {}, action) {
    if (shapeAssertionError) {
      throw shapeAssertionError
    }
    if (process.env.NODE_ENV !== 'production') {
      const warningMessage = getUnexpectedStateShapeWarningMessage(state, finalReducers, action, unexpectedKeyCache)
      if (warningMessage) {
        warning(warningMessage)
      }
    }

    let hasChanged = false
    const nextState = {}
    // 遍历获取对应key的nextState
    for (let i = 0; i < finalReducerKeys.length; i++) {
      const key = finalReducerKeys[i]
      const reducer = finalReducers[key]
      const previousStateForKey = state[key]
      const nextStateForKey = reducer(previousStateForKey, action)
      if (typeof nextStateForKey === 'undefined') {
        const errorMessage = getUndefinedStateErrorMessage(key, action)
        throw new Error(errorMessage)
      }
      nextState[key] = nextStateForKey
      hasChanged = hasChanged || nextStateForKey !== previousStateForKey
    }
    return hasChanged ? nextState : state
  }
}
```

## compose

> 从右到左来组合多个函数，并返回一个最终的函数。compose(f, g, h) 等于 (...args) => f(g(h(...args))), 不懂的话可以看一下`Array.reduce`的[api](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Array/Reduce)

```javascript
function compose(...funcs) {
  if (funcs.length === 0) {
    return (arg) => arg
  }

  if (funcs.length === 1) {
    return funcs[0]
  }

  return funcs.reduce((a, b) => (...args) => a(b(...args)))
}
```

## applyMiddleware

> `applyMiddleware` 接收多个参数，并返回一个以 createStore 为参数的 function,此 function 经过一系列的处理之后返回了 createStore 里面的所有方法和重写的 dispatch。

```javascript
function applyMiddleware(...middlewares) {
  // createStore对enhancer的调用方式:  return enhancer(createStore)(reducer, preloadedState)
  return (createStore) => (...args) => {
    // 首先创建store
    const store = createStore(...args)
    let dispatch = () => {
      throw new Error(
        `Dispatching while constructing your middleware is not allowed. ` +
          `Other middleware would not be applied to this dispatch.`
      )
    }
    // 这里有个点就是 dispatch 方法是使用匿名函数包裹的, 使用闭包保证了我们后续使用的dispatch 都是 applyMiddleware 之后增强过的 dispatch
    const middlewareAPI = {
      getState: store.getState,
      dispatch: (...args) => dispatch(...args),
    }

    // 注1: 中间件格式为 (store) => next => (action) => {},下详
    // 假设现在传入的为3个中间件数组: [m1, m2, m3]
    // 则 chain现在为[next => (action) => {  next(action); //m1 },  next => (action) => {  next(action); //m2 }, next => (action) => { next(action); //m3 }]
    const chain = middlewares.map((middleware) => middleware(middlewareAPI))
    // 让我们回忆一下compose返回的结果: compose(f, g, h) 等于 (...args) => f(g(h(...args)))
    // 所以 compose(...chain) 的结果为 (...args) => m1(m2(m3(...args)))
    // 即 dispatch = compose(...chain)(store.dispatch) = m1(m2(m3(store.dispatch)))
    // 然后把最后组合结果赋值给dispatch并返回, 这样在我们调用的时候, 其实就是使用了当前这个增强后的dispatch
    // 我们调用dispatch({type: xxx})时, 就相当于 (action) => {  next(action); //m1 }({type: xxx})
    dispatch = compose(...chain)(store.dispatch)

    return {
      ...store,
      dispatch,
    }
  }
}
```

### 1. 中间件的格式

格式如 `const m1 =  (store) => next => (action) => {}`, 不熟悉箭头函数的可能看着懵逼, 其实它就等同于下面这种写法:
```javascript
  const m1 = function(store) {
    // 执行 applyMiddleware 时被调用, 我们的中间件可以访问到传入的middlewareAPI 
    return function(next) {
      // next 表示接下来要执行的中间件
      return function(action) {
        // 中间件的逻辑所在之处
        // 随便做点什么
      }
    }
  }
```

我们以 `redux-thunk` 为例, 看下实际应用:
```JavaScript
function createThunkMiddleware(extraArgument) {
  return ({ dispatch, getState }) => (next) => (action) => {
    if (typeof action === 'function') {
      return action(dispatch, getState, extraArgument);
    }

    return next(action);
  };
}

const thunk = createThunkMiddleware();
export default thunk;
```

可以看到, `redux-thunk` 做的事情就是判断 action 类型是否是函数，若是，则执行 action，若不是，则继续传递 action 到下个 middleware。

### 2. 中间件的执行顺序

假设现在传入的为3个中间件数组: `[m1, m2, m3]`, 每个中间件的逻辑都为:
```javascript
{
  console.log('in')
  next(action)
  console.log('out')
}
```

则中间件的执行顺序为:
> m1 in => m2 in => m3 in => dispatch => m3 out => m2 out => m1 out ;

![image](https://miro.medium.com/max/700/1*LXvfJLM7DzJ8uxxC5xRDYg.png)

## bindActionCreators

> `bindActionCreators` 函数可以生成直接触发 action 的函数; 源码很简单, 就不详细说了

> 会使用到 `bindActionCreators` 的场景是当你需要把 action creator 往下传到一个组件上，却不想让这个组件觉察到 Redux 的存在，而且不希望把 dispatch 或 Redux store 传给它。
> 源码如下:

```javaScript
function bindActionCreator(actionCreator, dispatch) {
  return function() {
    return dispatch(actionCreator.apply(this, arguments))
  }
}

function bindActionCreators(actionCreators, dispatch) {
  if (typeof actionCreators === 'function') {
    return bindActionCreator(actionCreators, dispatch)
  }

  const keys = Object.keys(actionCreators)
  const boundActionCreators = {}
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    const actionCreator = actionCreators[key]
    if (typeof actionCreator === 'function') {
      boundActionCreators[key] = bindActionCreator(actionCreator, dispatch)
    }
  }
  return boundActionCreators
}
```
对这个API不了解, 看下[这里](https://www.redux.org.cn/docs/api/bindActionCreators.html)就很容易理解了~
