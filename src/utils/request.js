import Vue from 'vue'
import axios from 'axios'
import router from '@/router/routers'
import store from '../store'
import { getToken } from '@/utils/auth'
import Config from '@/settings'
import Cookies from 'js-cookie'

// 创建axios实例
const service = axios.create({
  baseURL: process.env.NODE_ENV === 'production' ? process.env.VUE_APP_BASE_API : '/', // api 的 base_url
  timeout: Config.timeout // 请求超时时间
})

// request拦截器
service.interceptors.request.use(
  config => {
    if (getToken()) {
      config.headers['Authorization'] = getToken() // 让每个请求携带自定义token 请根据实际情况自行修改
    }
    config.headers['Content-Type'] = 'application/json'
    return config
  },
  error => {
    Promise.reject(error)
  }
)

// response 拦截器
service.interceptors.response.use(
  response => {
    return response.data
  },
  error => {
    // 兼容blob下载出错json提示
    if (error.response.data instanceof Blob && error.response.data.type.toLowerCase().indexOf('json') !== -1) {
      const reader = new FileReader()
      reader.readAsText(error.response.data, 'utf-8')
      reader.onload = function(e) {
        const errorMsg = JSON.parse(reader.result).message
        Vue.prototype.$notification['error']({
          message: errorMsg
        });
      }
    } else {
      let code = 0
      try {
        code = error.response.data.status
      } catch (e) {
        if (error.toString().indexOf('Error: timeout') !== -1) {
          Vue.prototype.$notification['error']({
            message: '网络请求超时'
          });
          return Promise.reject(error)
        }
      }
      console.log(code)
      if (code) {
        if (code === 401) {
          store.dispatch('LogOut').then(() => {
            // 用户登录界面提示
            Cookies.set('point', 401)
            location.reload()
          })
        } else if (code === 403) {
          router.push({ path: '/401' })
        } else {
          const errorMsg = error.response.data.message
          if (errorMsg !== undefined) {
            Vue.prototype.$notification['error']({
              message: errorMsg
            });
          }
        }
      } else {
        Vue.prototype.$notification['error']({
          message: '接口请求失败'
        });
      }
    }
    return Promise.reject(error)
  }
)
export default service



import { ACCESS_TOKEN, TENANT_ID } from "@/store/mutation-types"

/**
 * 【指定 axios的 baseURL】
 * 如果手工指定 baseURL: '/jeecg-boot'
 * 则映射后端域名，通过 vue.config.js
 * @type {*|string}
 */
let apiBaseUrl = process.env.VUE_APP_API_BASE_URL;
//console.log("apiBaseUrl= ",apiBaseUrl)
// 创建 axios 实例
const service1 = axios.create({
  //baseURL: '/jeecg-boot',
  baseURL: apiBaseUrl, // api base_url
  timeout: 9000 // 请求超时时间
})

const err = (error) => {
  if (error.response) {
    let data = error.response.data
    const token = Vue.ls.get(ACCESS_TOKEN)
    console.log("------异常响应------",token)
    console.log("------异常响应------",error.response.status)
    switch (error.response.status) {
      case 403:
        Vue.prototype.$notification.error({ message: '系统提示', description: '拒绝访问',duration: 4})
        break
      case 500:
        console.log("------error.response------",error.response)
        // update-begin- --- author:liusq ------ date:20200910 ---- for:处理Blob情况----
        let type=error.response.request.responseType;
        if(type === 'blob'){
          blobToJson(data);
          break;
        }
        // update-end- --- author:liusq ------ date:20200910 ---- for:处理Blob情况----
        if(token && data.message.includes("Token失效")){
          // update-begin- --- author:scott ------ date:20190225 ---- for:Token失效采用弹框模式，不直接跳转----
          if (/wxwork|dingtalk/i.test(navigator.userAgent)) {
            Vue.prototype.$Jmessage.loading('登录已过期，正在重新登陆', 0)
          } else {
            Vue.prototype.$Jmodal.error({
              title: '登录已过期',
              content: '很抱歉，登录已过期，请重新登录',
              okText: '重新登录',
              mask: false,
              onOk: () => {
                store.dispatch('Logout').then(() => {
                  Vue.ls.remove(ACCESS_TOKEN)
                  try {
                    let path = window.document.location.pathname
                    console.log('location pathname -> ' + path)
                    if (path != '/' && path.indexOf('/user/login') == -1) {
                      window.location.reload()
                    }
                  } catch (e) {
                    window.location.reload()
                  }
                })
              }
            })
          }
          // update-end- --- author:scott ------ date:20190225 ---- for:Token失效采用弹框模式，不直接跳转----
        }
        break
      case 404:
        Vue.prototype.$notification.error({ message: '系统提示', description:'很抱歉，资源未找到!',duration: 4})
        break
      case 504:
        Vue.prototype.$notification.error({ message: '系统提示', description: '网络超时'})
        break
      case 401:
        Vue.prototype.$notification.error({ message: '系统提示', description:'很抱歉，登录已过期，请重新登录',duration: 4})
        if (token) {
          store.dispatch('Logout').then(() => {
            setTimeout(() => {
              window.location.reload()
            }, 1500)
          })
        }
        break
      default:
        Vue.prototype.$notification.error({
          message: '系统提示',
          description: data.message,
          duration: 4
        })
        break
    }
  } else if (error.message) {
    if (error.message.includes('timeout')) {
      Vue.prototype.$notification.error({message: '系统提示', description: '网络超时'})
    } else {
      Vue.prototype.$notification.error({message: '系统提示', description: error.message})
    }
  }
  return Promise.reject(error)
};

// request interceptor
service1.interceptors.request.use(config => {
  const token = Vue.ls.get(ACCESS_TOKEN)
  if (token) {
    config.headers[ 'X-Access-Token' ] = token // 让每个请求携带自定义 token 请根据实际情况自行修改
  }

  // update-begin--author:sunjianlei---date:20200723---for 如果当前在low-app环境，并且携带了appId，就向Header里传递appId
  const $route = router.currentRoute
  if ($route && $route.name && $route.name.startsWith('low-app') && $route.params.appId) {
    config.headers['X-Low-App-ID'] = $route.params.appId
  }
  // update-end--author:sunjianlei---date:20200723---for 如果当前在low-app环境，并且携带了appId，就向Header里传递appId

  //update-begin-author:taoyan date:2020707 for:多租户
  let tenantid = Vue.ls.get(TENANT_ID)
  if (!tenantid) {
    tenantid = 0;
  }
  config.headers[ 'tenant-id' ] = tenantid
  //update-end-author:taoyan date:2020707 for:多租户
  if(config.method=='get'){
    if(config.url.indexOf("sys/dict/getDictItems")<0){
      config.params = {
        _t: Date.parse(new Date())/1000,
        ...config.params
      }
    }
  }
  return config
},(error) => {
  return Promise.reject(error)
})

// response interceptor
service1.interceptors.response.use((response) => {
  return response.data
}, err)

const installer = {
  vm: {},
  install (Vue, router = {}) {
    Vue.use(vue_axios, router, service1)
  }
}
/**
 * Blob解析
 * @param data
 */
function blobToJson(data) {
  let fileReader = new FileReader();
  let token = Vue.ls.get(ACCESS_TOKEN);
  fileReader.onload = function() {
    try {
      let jsonData = JSON.parse(this.result);  // 说明是普通对象数据，后台转换失败
      console.log("jsonData",jsonData)
      if (jsonData.status === 500) {
        console.log("token----------》",token)
        if(token && jsonData.message.includes("Token失效")){
          Modal.error({
            title: '登录已过期',
            content: '很抱歉，登录已过期，请重新登录',
            okText: '重新登录',
            mask: false,
            onOk: () => {
              store.dispatch('Logout').then(() => {
                Vue.ls.remove(ACCESS_TOKEN)
                window.location.reload()
              })
            }
          })
        }
      }
    } catch (err) {
      // 解析成对象失败，说明是正常的文件流
      console.log("blob解析fileReader返回err",err)
    }
  };
  fileReader.readAsText(data)
}

export {
  installer as vue_axios,
  service1 as axios
}
