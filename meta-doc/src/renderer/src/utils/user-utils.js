import axios from "axios"
import { SERVER_URL } from "./consts"
import { loggedIn, user } from "./common-data"
import eventBus from "./event-bus"

export function verifyToken(token) {
    //console.log('token:', token)
    axios.post(SERVER_URL + '/user/verify-token', null,{
        params: {
            token: token
        },
    }).then((response) => {
        if(response.data.messageType === 'SUCCESS') {
            user.value=response.data.data
            loggedIn.value=true
            eventBus.emit('user-info-updated')
        }
    }).catch((error) => {
        console.error('Token验证请求失败:', error)
        sessionStorage.removeItem('loginToken')
        localStorage.removeItem('loginToken')
        loggedIn.value = false
        user.value = null
    })


}