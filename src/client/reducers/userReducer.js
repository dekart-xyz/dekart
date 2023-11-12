import { userStreamUpdate } from '../actions/user'

export default function user (state = null, action) {
    switch (action.type) {
        case userStreamUpdate.name:
            return action.userStream
        default:
            return state
    }
}