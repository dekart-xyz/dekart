import React from 'react'
import ReactDOM from 'react-dom'
import App from './App'
import './index.css'
import { createStore, applyMiddleware, compose } from 'redux'
import { Provider } from 'react-redux'
import thunk from 'redux-thunk'
// import { createLogger } from 'redux-logger'
import reducer from './reducers/rootReducer'
// import { taskMiddleware } from 'react-palm/tasks'
// import screenshotInit from './lib/screenshot'
import { enhanceReduxMiddleware } from '@kepler.gl/reducers'

const store = createStore(
  reducer,
  compose(
    applyMiddleware(...enhanceReduxMiddleware([thunk]))
  )
)
// screenshotInit(store)

ReactDOM.render(
  <Provider store={store}>
    <App />
  </Provider>
  ,
  document.getElementById('root')
)
