import { wrapMapToPropsConstant, wrapMapToPropsFunc } from './wrapMapToProps'

// 传入的 mapStateToProps是函数
export function whenMapStateToPropsIsFunction(mapStateToProps) {
  return typeof mapStateToProps === 'function'
    ? wrapMapToPropsFunc(mapStateToProps, 'mapStateToProps')
    : undefined
}

// mapStateToProps是假值
export function whenMapStateToPropsIsMissing(mapStateToProps) {
  return !mapStateToProps ? wrapMapToPropsConstant(() => ({})) : undefined
}

export default [whenMapStateToPropsIsFunction, whenMapStateToPropsIsMissing]
