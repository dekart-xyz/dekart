/* eslint-env jest */

import { deepCompare } from './deepCompare'

describe('deepCompare', () => {
  it('should return true for identical mapConfigs with different layer order', () => {
    const o1 = { version: 'v1', config: { visState: { filters: [], layers: [{ id: 'no8rf4n', type: 'geojson', config: { dataId: 'be817649-273f-42d2-9243-6485e20424ba', label: '1L', color: [18, 147, 154], highlightColor: [252, 242, 26, 255], columns: { geojson: 'geometry' }, isVisible: true, visConfig: { opacity: 0.8, strokeOpacity: 0.8, thickness: 0.5, strokeColor: [221, 178, 124], colorRange: { name: 'Global Warming', type: 'sequential', category: 'Uber', colors: ['#5A1846', '#900C3F', '#C70039', '#E3611C', '#F1920E', '#FFC300'] }, strokeColorRange: { name: 'Global Warming', type: 'sequential', category: 'Uber', colors: ['#5A1846', '#900C3F', '#C70039', '#E3611C', '#F1920E', '#FFC300'] }, radius: 10, sizeRange: [0, 10], radiusRange: [0, 50], heightRange: [0, 500], elevationScale: 5, enableElevationZoomFactor: true, stroked: true, filled: false, enable3d: false, wireframe: false }, hidden: false, textLabel: [{ field: null, color: [255, 255, 255], size: 18, offset: [0, 0], anchor: 'start', alignment: 'center' }] }, visualChannels: { colorField: null, colorScale: 'quantile', strokeColorField: null, strokeColorScale: 'quantile', sizeField: null, sizeScale: 'linear', heightField: null, heightScale: 'linear', radiusField: null, radiusScale: 'linear' } }, { id: '2vygid6', type: 'geojson', config: { dataId: '67482231-53a9-4484-ab38-e59a34eed8ff', label: '2L', color: [18, 147, 154], highlightColor: [252, 242, 26, 255], columns: { geojson: 'geometry' }, isVisible: true, visConfig: { opacity: 0.8, strokeOpacity: 0.8, thickness: 0.5, strokeColor: null, colorRange: { name: 'Global Warming', type: 'sequential', category: 'Uber', colors: ['#5A1846', '#900C3F', '#C70039', '#E3611C', '#F1920E', '#FFC300'] }, strokeColorRange: { name: 'Global Warming', type: 'sequential', category: 'Uber', colors: ['#5A1846', '#900C3F', '#C70039', '#E3611C', '#F1920E', '#FFC300'] }, radius: 10, sizeRange: [0, 10], radiusRange: [0, 50], heightRange: [0, 500], elevationScale: 5, enableElevationZoomFactor: true, stroked: true, filled: false, enable3d: false, wireframe: false }, hidden: false, textLabel: [{ field: null, color: [255, 255, 255], size: 18, offset: [0, 0], anchor: 'start', alignment: 'center' }] }, visualChannels: { colorField: null, colorScale: 'quantile', strokeColorField: null, strokeColorScale: 'quantile', sizeField: null, sizeScale: 'linear', heightField: null, heightScale: 'linear', radiusField: null, radiusScale: 'linear' } }], interactionConfig: { tooltip: { fieldsToShow: { '67482231-53a9-4484-ab38-e59a34eed8ff': [{ name: 'class', format: null }], 'be817649-273f-42d2-9243-6485e20424ba': [] }, compareMode: false, compareType: 'absolute', enabled: true }, brush: { size: 0.5, enabled: false }, geocoder: { enabled: false }, coordinate: { enabled: false } }, layerBlending: 'normal', splitMaps: [], animationConfig: { currentTime: null, speed: 1 } }, mapState: { bearing: 0, dragRotate: false, latitude: 0, longitude: 0, pitch: 0, zoom: 0, isSplit: false }, mapStyle: { styleType: 'dark', topLayerGroups: {}, visibleLayerGroups: { label: true, road: true, border: false, building: true, water: true, land: true, '3d building': false }, threeDBuildingColor: [9.665468314072013, 17.18305478057247, 31.1442867897876], mapStyles: {} } } }
    const o2 = { version: 'v1', config: { visState: { filters: [], layers: [{ id: 'no8rf4n', type: 'geojson', config: { dataId: 'be817649-273f-42d2-9243-6485e20424ba', label: '1L', color: [18, 147, 154], highlightColor: [252, 242, 26, 255], columns: { geojson: 'geometry' }, isVisible: true, visConfig: { opacity: 0.8, strokeOpacity: 0.8, thickness: 0.5, strokeColor: [221, 178, 124], colorRange: { name: 'Global Warming', type: 'sequential', category: 'Uber', colors: ['#5A1846', '#900C3F', '#C70039', '#E3611C', '#F1920E', '#FFC300'] }, strokeColorRange: { name: 'Global Warming', type: 'sequential', category: 'Uber', colors: ['#5A1846', '#900C3F', '#C70039', '#E3611C', '#F1920E', '#FFC300'] }, radius: 10, sizeRange: [0, 10], radiusRange: [0, 50], heightRange: [0, 500], elevationScale: 5, enableElevationZoomFactor: true, stroked: true, filled: false, enable3d: false, wireframe: false }, hidden: false, textLabel: [{ field: null, color: [255, 255, 255], size: 18, offset: [0, 0], anchor: 'start', alignment: 'center' }] }, visualChannels: { colorField: null, colorScale: 'quantile', strokeColorField: null, strokeColorScale: 'quantile', sizeField: null, sizeScale: 'linear', heightField: null, heightScale: 'linear', radiusField: null, radiusScale: 'linear' } }, { id: '2vygid6', type: 'geojson', config: { dataId: '67482231-53a9-4484-ab38-e59a34eed8ff', label: '2L', color: [18, 147, 154], highlightColor: [252, 242, 26, 255], columns: { geojson: 'geometry' }, isVisible: true, visConfig: { opacity: 0.8, strokeOpacity: 0.8, thickness: 0.5, strokeColor: null, colorRange: { name: 'Global Warming', type: 'sequential', category: 'Uber', colors: ['#5A1846', '#900C3F', '#C70039', '#E3611C', '#F1920E', '#FFC300'] }, strokeColorRange: { name: 'Global Warming', type: 'sequential', category: 'Uber', colors: ['#5A1846', '#900C3F', '#C70039', '#E3611C', '#F1920E', '#FFC300'] }, radius: 10, sizeRange: [0, 10], radiusRange: [0, 50], heightRange: [0, 500], elevationScale: 5, enableElevationZoomFactor: true, stroked: true, filled: false, enable3d: false, wireframe: false }, hidden: false, textLabel: [{ field: null, color: [255, 255, 255], size: 18, offset: [0, 0], anchor: 'start', alignment: 'center' }] }, visualChannels: { colorField: null, colorScale: 'quantile', strokeColorField: null, strokeColorScale: 'quantile', sizeField: null, sizeScale: 'linear', heightField: null, heightScale: 'linear', radiusField: null, radiusScale: 'linear' } }], interactionConfig: { tooltip: { fieldsToShow: { 'be817649-273f-42d2-9243-6485e20424ba': [], '67482231-53a9-4484-ab38-e59a34eed8ff': [{ name: 'class', format: null }] }, compareMode: false, compareType: 'absolute', enabled: true }, brush: { size: 0.5, enabled: false }, geocoder: { enabled: false }, coordinate: { enabled: false } }, layerBlending: 'normal', splitMaps: [], animationConfig: { currentTime: null, speed: 1 } }, mapState: { bearing: 0, dragRotate: false, latitude: 0, longitude: 0, pitch: 0, zoom: 0, isSplit: false }, mapStyle: { styleType: 'dark', topLayerGroups: {}, visibleLayerGroups: { label: true, road: true, border: false, building: true, water: true, land: true, '3d building': false }, threeDBuildingColor: [9.665468314072013, 17.18305478057247, 31.1442867897876], mapStyles: {} } } }
    expect(deepCompare(o1, o2)).toBe(true)
  })

  it('should return false for different mapConfigs', () => {
    const o1 = { version: 'v1', config: { visState: { filters: [], layers: [{ id: 'no8rf4n', type: 'geojson', config: { dataId: 'be817649-273f-42d2-9243-6485e20424ba', label: '1L', color: [18, 147, 154], highlightColor: [252, 242, 26, 255], columns: { geojson: 'geometry' }, isVisible: true, visConfig: { opacity: 0.8, strokeOpacity: 0.8, thickness: 0.5, strokeColor: [221, 178, 124], colorRange: { name: 'Global Warming', type: 'sequential', category: 'Uber', colors: ['#5A1846', '#900C3F', '#C70039', '#E3611C', '#F1920E', '#FFC300'] }, strokeColorRange: { name: 'Global Warming', type: 'sequential', category: 'Uber', colors: ['#5A1846', '#900C3F', '#C70039', '#E3611C', '#F1920E', '#FFC300'] }, radius: 10, sizeRange: [0, 10], radiusRange: [0, 50], heightRange: [0, 500], elevationScale: 5, enableElevationZoomFactor: true, stroked: true, filled: false, enable3d: false, wireframe: false }, hidden: false, textLabel: [{ field: null, color: [255, 255, 255], size: 18, offset: [0, 0], anchor: 'start', alignment: 'center' }] }, visualChannels: { colorField: null, colorScale: 'quantile', strokeColorField: null, strokeColorScale: 'quantile', sizeField: null, sizeScale: 'linear', heightField: null, heightScale: 'linear', radiusField: null, radiusScale: 'linear' } }, { id: '2vygid6', type: 'geojson', config: { dataId: '67482231-53a9-4484-ab38-e59a34eed8ff', label: '2L', color: [18, 147, 154], highlightColor: [252, 242, 26, 255], columns: { geojson: 'geometry' }, isVisible: true, visConfig: { opacity: 0.8, strokeOpacity: 0.8, thickness: 0.5, strokeColor: null, colorRange: { name: 'Global Warming', type: 'sequential', category: 'Uber', colors: ['#5A1846', '#900C3F', '#C70039', '#E3611C', '#F1920E', '#FFC300'] }, strokeColorRange: { name: 'Global Warming', type: 'sequential', category: 'Uber', colors: ['#5A1846', '#900C3F', '#C70039', '#E3611C', '#F1920E', '#FFC300'] }, radius: 10, sizeRange: [0, 10], radiusRange: [0, 50], heightRange: [0, 500], elevationScale: 5, enableElevationZoomFactor: true, stroked: true, filled: false, enable3d: false, wireframe: false }, hidden: false, textLabel: [{ field: null, color: [255, 255, 255], size: 18, offset: [0, 0], anchor: 'start', alignment: 'center' }] }, visualChannels: { colorField: null, colorScale: 'quantile', strokeColorField: null, strokeColorScale: 'quantile', sizeField: null, sizeScale: 'linear', heightField: null, heightScale: 'linear', radiusField: null, radiusScale: 'linear' } }], interactionConfig: { tooltip: { fieldsToShow: { '67482231-53a9-4484-ab38-e59a34eed8ff': [{ name: 'class', format: null }], 'be817649-273f-42d2-9243-6485e20424ba': [] }, compareMode: false, compareType: 'absolute', enabled: true }, brush: { size: 0.5, enabled: false }, geocoder: { enabled: false }, coordinate: { enabled: false } }, layerBlending: 'normal', splitMaps: [], animationConfig: { currentTime: null, speed: 1 } }, mapState: { bearing: 0, dragRotate: false, latitude: 0, longitude: 0, pitch: 0, zoom: 0, isSplit: false }, mapStyle: { styleType: 'dark', topLayerGroups: {}, visibleLayerGroups: { label: true, road: true, border: false, building: true, water: true, land: true, '3d building': false }, threeDBuildingColor: [9.665468314072013, 17.18305478057247, 31.1442867897876], mapStyles: {} } } }
    const o2 = { version: 'v1', config: { visState: { filters: [], layers: [{ id: 'no8rf4n', type: 'geojson', config: { dataId: 'be817649-273f-42d2-9243-6485e20424ba', label: '1', color: [18, 147, 154], highlightColor: [252, 242, 26, 255], columns: { geojson: 'geometry' }, isVisible: true, visConfig: { opacity: 0.8, strokeOpacity: 0.8, thickness: 0.5, strokeColor: [221, 178, 124], colorRange: { name: 'Global Warming', type: 'sequential', category: 'Uber', colors: ['#5A1846', '#900C3F', '#C70039', '#E3611C', '#F1920E', '#FFC300'] }, strokeColorRange: { name: 'Global Warming', type: 'sequential', category: 'Uber', colors: ['#5A1846', '#900C3F', '#C70039', '#E3611C', '#F1920E', '#FFC300'] }, radius: 10, sizeRange: [0, 10], radiusRange: [0, 50], heightRange: [0, 500], elevationScale: 5, enableElevationZoomFactor: true, stroked: true, filled: false, enable3d: false, wireframe: false }, hidden: false, textLabel: [{ field: null, color: [255, 255, 255], size: 18, offset: [0, 0], anchor: 'start', alignment: 'center' }] }, visualChannels: { colorField: null, colorScale: 'quantile', strokeColorField: null, strokeColorScale: 'quantile', sizeField: null, sizeScale: 'linear', heightField: null, heightScale: 'linear', radiusField: null, radiusScale: 'linear' } }, { id: '2vygid6', type: 'geojson', config: { dataId: '67482231-53a9-4484-ab38-e59a34eed8ff', label: '2L', color: [18, 147, 154], highlightColor: [252, 242, 26, 255], columns: { geojson: 'geometry' }, isVisible: true, visConfig: { opacity: 0.8, strokeOpacity: 0.8, thickness: 0.5, strokeColor: null, colorRange: { name: 'Global Warming', type: 'sequential', category: 'Uber', colors: ['#5A1846', '#900C3F', '#C70039', '#E3611C', '#F1920E', '#FFC300'] }, strokeColorRange: { name: 'Global Warming', type: 'sequential', category: 'Uber', colors: ['#5A1846', '#900C3F', '#C70039', '#E3611C', '#F1920E', '#FFC300'] }, radius: 10, sizeRange: [0, 10], radiusRange: [0, 50], heightRange: [0, 500], elevationScale: 5, enableElevationZoomFactor: true, stroked: true, filled: false, enable3d: false, wireframe: false }, hidden: false, textLabel: [{ field: null, color: [255, 255, 255], size: 18, offset: [0, 0], anchor: 'start', alignment: 'center' }] }, visualChannels: { colorField: null, colorScale: 'quantile', strokeColorField: null, strokeColorScale: 'quantile', sizeField: null, sizeScale: 'linear', heightField: null, heightScale: 'linear', radiusField: null, radiusScale: 'linear' } }], interactionConfig: { tooltip: { fieldsToShow: { 'be817649-273f-42d2-9243-6485e20424ba': [], '67482231-53a9-4484-ab38-e59a34eed8ff': [{ name: 'class', format: null }] }, compareMode: false, compareType: 'absolute', enabled: true }, brush: { size: 0.5, enabled: false }, geocoder: { enabled: false }, coordinate: { enabled: false } }, layerBlending: 'normal', splitMaps: [], animationConfig: { currentTime: null, speed: 1 } }, mapState: { bearing: 0, dragRotate: false, latitude: 0, longitude: 0, pitch: 0, zoom: 0, isSplit: false }, mapStyle: { styleType: 'dark', topLayerGroups: {}, visibleLayerGroups: { label: true, road: true, border: false, building: true, water: true, land: true, '3d building': false }, threeDBuildingColor: [9.665468314072013, 17.18305478057247, 31.1442867897876], mapStyles: {} } } }
    expect(deepCompare(o1, o2)).toBe(false)
  })

  it('should return true for identical objects', () => {
    const obj1 = { a: 1, b: 2, c: 3 }
    const obj2 = { a: 1, b: 2, c: 3 }
    expect(deepCompare(obj1, obj2)).toBe(true)
  })

  it('should return false for different objects', () => {
    const obj1 = { a: 1, b: 2, c: 3 }
    const obj2 = { a: 1, b: 2, c: 4 }
    expect(deepCompare(obj1, obj2)).toBe(false)
  })

  it('should return true for nested identical objects', () => {
    const obj1 = { a: 1, b: { x: 10, y: 20 }, c: 3 }
    const obj2 = { a: 1, b: { x: 10, y: 20 }, c: 3 }
    expect(deepCompare(obj1, obj2)).toBe(true)
  })

  it('should return false for nested different objects', () => {
    const obj1 = { a: 1, b: { x: 10, y: 20 }, c: 3 }
    const obj2 = { a: 1, b: { x: 10, y: 21 }, c: 3 }
    expect(deepCompare(obj1, obj2)).toBe(false)
  })

  it('should return true for objects with same keys in different order', () => {
    const obj1 = { a: 1, b: 2, c: 3 }
    const obj2 = { c: 3, b: 2, a: 1 }
    expect(deepCompare(obj1, obj2)).toBe(true)
  })

  it('should return false for objects with different number of keys', () => {
    const obj1 = { a: 1, b: 2 }
    const obj2 = { a: 1, b: 2, c: 3 }
    expect(deepCompare(obj1, obj2)).toBe(false)
  })

  it('should return true for identical arrays', () => {
    const arr1 = [1, 2, 3]
    const arr2 = [1, 2, 3]
    expect(deepCompare(arr1, arr2)).toBe(true)
  })

  it('should return false for different arrays', () => {
    const arr1 = [1, 2, 3]
    const arr2 = [1, 2, 4]
    expect(deepCompare(arr1, arr2)).toBe(false)
  })

  it('should return true for nested identical arrays', () => {
    const arr1 = [1, [2, 3], 4]
    const arr2 = [1, [2, 3], 4]
    expect(deepCompare(arr1, arr2)).toBe(true)
  })

  it('should return false for nested different arrays', () => {
    const arr1 = [1, [2, 3], 4]
    const arr2 = [1, [2, 4], 4]
    expect(deepCompare(arr1, arr2)).toBe(false)
  })
})
