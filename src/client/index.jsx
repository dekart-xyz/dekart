import React from 'react'
import ReactDOM from 'react-dom'
import App from './App'
import './index.css'
import { createStore, applyMiddleware, compose } from 'redux'
import { Provider } from 'react-redux'
import thunk from 'redux-thunk'
import reducer from './reducers/rootReducer'
import { enhanceReduxMiddleware } from '@kepler.gl/reducers'
import { setTrackingStore, setTrackEventToServer } from './lib/tracking'
import { trackEventToServer } from './actions/tracking'

const store = createStore(
  reducer,
  compose(
    applyMiddleware(...enhanceReduxMiddleware([thunk]))
  )
)

// Initialize tracking with Redux store for Dekart Cloud
setTrackingStore(store)
setTrackEventToServer(trackEventToServer)

ReactDOM.render(
  <Provider store={store}>
    <App />
  </Provider>
  ,
  document.getElementById('root')
)
