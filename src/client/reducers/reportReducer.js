import { ActionTypes as KeplerActionTypes } from '@kepler.gl/actions'
import { setStreamError } from '../actions/message'
import { queryChanged, queryParamChanged, updateQueryParamsFromQueries } from '../actions/query'
import { setReadmeValue } from '../actions/readme'
import { closeReport, forkReport, newForkedReport, newReport, openReport, reportsListUpdate, reportTitleChange, reportUpdate, reportWillOpen, savedReport, saveMap, setReportChanged, toggleReportEdit, toggleReportFullscreen, unsubscribeReports } from '../actions/report'

export function reportDirectAccessEmails (state = [], action) {
  switch (action.type) {
    case openReport.name:
      return []
    case reportUpdate.name:
      return action.directAccessEmailsList
    default:
      return state
  }
}

export function report (state = null, action) {
  switch (action.type) {
    case openReport.name:
      return null
    case closeReport.name:
      return null
    case reportUpdate.name:
      return action.report
    default:
      return state
  }
}

const defaultReportStatus = {
  dataAdded: false,
  title: null,
  edit: false, // edit UI mode (does not mean user has write access)
  online: false,
  newReportId: null,
  lastUpdated: 0,
  willOpen: false, // report will be opened on this page
  opened: false,
  saving: false,
  lastChanged: 0,
  lastSaved: 0,
  savedReportVersion: 0,
  fullscreen: null
}
export function reportStatus (state = defaultReportStatus, action) {
  switch (action.type) {
    case updateQueryParamsFromQueries.name:
    case queryParamChanged.name:
    case queryChanged.name:
    case setReadmeValue.name:
    case setReportChanged.name: {
      const lastChanged = Date.now()
      return {
        ...state,
        lastChanged
      }
    }
    case reportWillOpen.name:
      return {
        ...state,
        willOpen: true
      }
    case forkReport.name:
    case saveMap.name:
      return {
        ...state,
        saving: true
      }
    case reportTitleChange.name:
      return {
        ...state,
        title: action.title,
        lastChanged: Date.now()
      }
    case savedReport.name:
      return {
        ...state,
        saving: false,
        lastSaved: action.lastSaved,
        savedReportVersion: action.savedReportVersion
      }
    case toggleReportFullscreen.name:
      return {
        ...state,
        fullscreen: !state.fullscreen
      }
    case reportUpdate.name: {
      let fullscreen = state.fullscreen
      if (fullscreen === null) { // not defined yet, if defined, keep it as is
        const { readme } = action.report
        fullscreen = !(readme || state.edit)
      }
      return {
        ...state,
        online: true,
        title: action.report.title,
        lastUpdated: Date.now(),
        fullscreen
      }
    }
    case openReport.name: {
      return {
        ...defaultReportStatus,
        opened: true,
        willOpen: true,
        edit: state.edit
      }
    }
    case toggleReportEdit.name: {
      return {
        ...state,
        edit: action.edit,
        fullscreen: action.fullscreen
      }
    }
    case closeReport.name:
      return {
        ...defaultReportStatus,
        willOpen: true
      }
    case setStreamError.name:
      return {
        ...state,
        online: false
      }
    case KeplerActionTypes.ADD_DATA_TO_MAP:
      return {
        ...state,
        dataAdded: true
      }
    case newReport.name:
    case newForkedReport.name:
      return {
        ...state,
        newReportId: action.id
      }
    default:
      return state
  }
}
const defaultReportsList = { loaded: false, reports: [] }
export function reportsList (state = defaultReportsList, action) {
  switch (action.type) {
    case unsubscribeReports.name:
      return defaultReportsList
    case reportsListUpdate.name:
      return {
        ...state,
        loaded: true,
        my: action.reportsList.filter(report => !report.archived && report.isAuthor),
        archived: action.reportsList.filter(report => report.archived),
        discoverable: action.reportsList.filter(report => report.discoverable && !report.archived)
      }
    default:
      return state
  }
}
