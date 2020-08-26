// 判断是否是纯对象, 即相同上下文环境且通过直接声明{}或者 new Object方式定义的
// 什么情况下可能是不同上下文环境? 比如浏览器中的同域 iframe, nodejs 中的 vm 等
// Object.getPrototypeOf(a) === Object.prototype   ->  true
/**  判断是否是纯对象 */
export default function isPlainObject(obj) {
  if (typeof obj !== 'object' || obj === null) return false

  let proto = Object.getPrototypeOf(obj)
  if (proto === null) return true

  let baseProto = proto
  while (Object.getPrototypeOf(baseProto) !== null) {
    baseProto = Object.getPrototypeOf(baseProto)
  }

  return proto === baseProto
}
