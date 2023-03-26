import React from 'react'
import ReactDOM from 'react-dom'
import App from './App'
import './index.css'
import { createStore, applyMiddleware, compose } from 'redux'
import { Provider } from 'react-redux'
import thunk from 'redux-thunk'
// import { createLogger } from 'redux-logger'
import reducer from './reducers'
import { taskMiddleware } from 'react-palm/tasks'
import screenshotInit from './lib/screenshot'

const store = createStore(
  reducer,
  compose(
    applyMiddleware(taskMiddleware, thunk/*, createLogger() */)
  )
)
screenshotInit(store)

ReactDOM.render(
  <Provider store={store}>
    <App />
  </Provider>
  ,
  document.getElementById('root')
)
