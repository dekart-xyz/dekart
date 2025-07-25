export const sedonaKeywords = [
  // Reserved Keywords
  { name: 'SELECT', value: 'SELECT', meta: 'keyword' },
  { name: 'FROM', value: 'FROM', meta: 'keyword' },
  { name: 'WHERE', value: 'WHERE', meta: 'keyword' },
  { name: 'INSERT', value: 'INSERT', meta: 'keyword' },
  { name: 'UPDATE', value: 'UPDATE', meta: 'keyword' },
  { name: 'DELETE', value: 'DELETE', meta: 'keyword' },
  { name: 'CREATE', value: 'CREATE', meta: 'keyword' },
  { name: 'DROP', value: 'DROP', meta: 'keyword' },
  { name: 'ALTER', value: 'ALTER', meta: 'keyword' },
  { name: 'TABLE', value: 'TABLE', meta: 'keyword' },
  { name: 'VIEW', value: 'VIEW', meta: 'keyword' },
  { name: 'INDEX', value: 'INDEX', meta: 'keyword' },
  { name: 'AND', value: 'AND', meta: 'keyword' },
  { name: 'OR', value: 'OR', meta: 'keyword' },
  { name: 'NOT', value: 'NOT', meta: 'keyword' },
  { name: 'NULL', value: 'NULL', meta: 'keyword' },
  { name: 'JOIN', value: 'JOIN', meta: 'keyword' },
  { name: 'INNER', value: 'INNER', meta: 'keyword' },
  { name: 'LEFT', value: 'LEFT', meta: 'keyword' },
  { name: 'RIGHT', value: 'RIGHT', meta: 'keyword' },
  { name: 'FULL', value: 'FULL', meta: 'keyword' },
  { name: 'ON', value: 'ON', meta: 'keyword' },
  { name: 'GROUP', value: 'GROUP', meta: 'keyword' },
  { name: 'BY', value: 'BY', meta: 'keyword' },
  { name: 'HAVING', value: 'HAVING', meta: 'keyword' },
  { name: 'ORDER', value: 'ORDER', meta: 'keyword' },
  { name: 'UNION', value: 'UNION', meta: 'keyword' },
  { name: 'ALL', value: 'ALL', meta: 'keyword' },
  { name: 'DISTINCT', value: 'DISTINCT', meta: 'keyword' },
  { name: 'LIMIT', value: 'LIMIT', meta: 'keyword' },
  { name: 'OFFSET', value: 'OFFSET', meta: 'keyword' },
  { name: 'CASE', value: 'CASE', meta: 'keyword' },
  { name: 'WHEN', value: 'WHEN', meta: 'keyword' },
  { name: 'THEN', value: 'THEN', meta: 'keyword' },
  { name: 'ELSE', value: 'ELSE', meta: 'keyword' },
  { name: 'END', value: 'END', meta: 'keyword' },
  { name: 'AS', value: 'AS', meta: 'keyword' },
  { name: 'IN', value: 'IN', meta: 'keyword' },
  { name: 'LIKE', value: 'LIKE', meta: 'keyword' },
  { name: 'ILIKE', value: 'ILIKE', meta: 'keyword' },
  { name: 'BETWEEN', value: 'BETWEEN', meta: 'keyword' },
  { name: 'EXISTS', value: 'EXISTS', meta: 'keyword' },
  { name: 'IS', value: 'IS', meta: 'keyword' },
  { name: 'SET', value: 'SET', meta: 'keyword' },
  { name: 'VALUES', value: 'VALUES', meta: 'keyword' },
  { name: 'INTO', value: 'INTO', meta: 'keyword' },
  { name: 'WITH', value: 'WITH', meta: 'keyword' },
  { name: 'CROSS', value: 'CROSS', meta: 'keyword' },
  { name: 'OUTER', value: 'OUTER', meta: 'keyword' },
  { name: 'TOP', value: 'TOP', meta: 'keyword' },
  { name: 'IF', value: 'IF', meta: 'keyword' },
  { name: 'PROCEDURE', value: 'PROCEDURE', meta: 'keyword' },
  { name: 'FUNCTION', value: 'FUNCTION', meta: 'keyword' },
  { name: 'PRIMARY', value: 'PRIMARY', meta: 'keyword' },
  { name: 'KEY', value: 'KEY', meta: 'keyword' },
  { name: 'FOREIGN', value: 'FOREIGN', meta: 'keyword' },
  { name: 'REFERENCES', value: 'REFERENCES', meta: 'keyword' },
  { name: 'ASC', value: 'ASC', meta: 'keyword' },
  { name: 'DESC', value: 'DESC', meta: 'keyword' },

  // General Functions
  { name: 'ABS', value: 'ABS()', meta: 'function' },
  { name: 'CEIL', value: 'CEIL()', meta: 'function' },
  { name: 'FLOOR', value: 'FLOOR()', meta: 'function' },
  { name: 'ROUND', value: 'ROUND()', meta: 'function' },
  { name: 'EXP', value: 'EXP()', meta: 'function' },
  { name: 'LOG', value: 'LOG()', meta: 'function' },
  { name: 'POWER', value: 'POWER()', meta: 'function' },
  { name: 'SQRT', value: 'SQRT()', meta: 'function' },
  { name: 'CONCAT', value: 'CONCAT()', meta: 'function' },
  { name: 'UPPER', value: 'UPPER()', meta: 'function' },
  { name: 'LOWER', value: 'LOWER()', meta: 'function' },
  { name: 'LTRIM', value: 'LTRIM()', meta: 'function' },
  { name: 'RTRIM', value: 'RTRIM()', meta: 'function' },
  { name: 'TRIM', value: 'TRIM()', meta: 'function' },
  { name: 'SUBSTR', value: 'SUBSTR()', meta: 'function' },
  { name: 'REPLACE', value: 'REPLACE()', meta: 'function' },
  { name: 'REGEXP_REPLACE', value: 'REGEXP_REPLACE()', meta: 'function' },
  { name: 'REGEXP_LIKE', value: 'REGEXP_LIKE()', meta: 'function' },
  { name: 'CURRENT_DATE', value: 'CURRENT_DATE()', meta: 'function' },
  { name: 'CURRENT_TIME', value: 'CURRENT_TIME()', meta: 'function' },
  { name: 'CURRENT_TIMESTAMP', value: 'CURRENT_TIMESTAMP()', meta: 'function' },
  { name: 'DATE_PART', value: 'DATE_PART()', meta: 'function' },
  { name: 'DATE_TRUNC', value: 'DATE_TRUNC()', meta: 'function' },

  // Geospatial (GIS) Functions
  { name: 'GeometryType', value: 'GeometryType()', meta: 'GIS function' },
  { name: 'ST_3DDistance', value: 'ST_3DDistance()', meta: 'GIS function' },
  { name: 'ST_AddPoint', value: 'ST_AddPoint()', meta: 'GIS function' },
  { name: 'ST_Affine', value: 'ST_Affine()', meta: 'GIS function' },
  { name: 'ST_Angle', value: 'ST_Angle()', meta: 'GIS function' },
  { name: 'ST_Area', value: 'ST_Area()', meta: 'GIS function' },
  { name: 'ST_AreaSpheroid', value: 'ST_AreaSpheroid()', meta: 'GIS function' },
  { name: 'ST_AsBinary', value: 'ST_AsBinary()', meta: 'GIS function' },
  { name: 'ST_AsEWKB', value: 'ST_AsEWKB()', meta: 'GIS function' },
  { name: 'ST_AsEWKT', value: 'ST_AsEWKT()', meta: 'GIS function' },
  { name: 'ST_AsGeoJSON', value: 'ST_AsGeoJSON()', meta: 'GIS function' },
  { name: 'ST_AsGML', value: 'ST_AsGML()', meta: 'GIS function' },
  { name: 'ST_AsKML', value: 'ST_AsKML()', meta: 'GIS function' },
  { name: 'ST_AsText', value: 'ST_AsText()', meta: 'GIS function' },
  { name: 'ST_Azimuth', value: 'ST_Azimuth()', meta: 'GIS function' },
  { name: 'ST_Boundary', value: 'ST_Boundary()', meta: 'GIS function' },
  { name: 'ST_BoundingDiagonal', value: 'ST_BoundingDiagonal()', meta: 'GIS function' },
  { name: 'ST_Buffer', value: 'ST_Buffer()', meta: 'GIS function' },
  { name: 'ST_BuildArea', value: 'ST_BuildArea()', meta: 'GIS function' },
  { name: 'ST_Centroid', value: 'ST_Centroid()', meta: 'GIS function' },
  { name: 'ST_ClosestPoint', value: 'ST_ClosestPoint()', meta: 'GIS function' },
  { name: 'ST_Collect', value: 'ST_Collect()', meta: 'GIS function' },
  { name: 'ST_CollectionExtract', value: 'ST_CollectionExtract()', meta: 'GIS function' },
  { name: 'ST_ConcaveHull', value: 'ST_ConcaveHull()', meta: 'GIS function' },
  { name: 'ST_ConvexHull', value: 'ST_ConvexHull()', meta: 'GIS function' },
  { name: 'ST_CoordDim', value: 'ST_CoordDim()', meta: 'GIS function' },
  { name: 'ST_Degrees', value: 'ST_Degrees()', meta: 'GIS function' },
  { name: 'ST_Difference', value: 'ST_Difference()', meta: 'GIS function' },
  { name: 'ST_Dimension', value: 'ST_Dimension()', meta: 'GIS function' },
  { name: 'ST_Distance', value: 'ST_Distance()', meta: 'GIS function' },
  { name: 'ST_DistanceSphere', value: 'ST_DistanceSphere()', meta: 'GIS function' },
  { name: 'ST_DistanceSpheroid', value: 'ST_DistanceSpheroid()', meta: 'GIS function' },
  { name: 'ST_Dump', value: 'ST_Dump()', meta: 'GIS function' },
  { name: 'ST_DumpPoints', value: 'ST_DumpPoints()', meta: 'GIS function' },
  { name: 'ST_EndPoint', value: 'ST_EndPoint()', meta: 'GIS function' },
  { name: 'ST_Envelope', value: 'ST_Envelope()', meta: 'GIS function' },
  { name: 'ST_ExteriorRing', value: 'ST_ExteriorRing()', meta: 'GIS function' },
  { name: 'ST_FlipCoordinates', value: 'ST_FlipCoordinates()', meta: 'GIS function' },
  { name: 'ST_Force_2D', value: 'ST_Force_2D()', meta: 'GIS function' },
  { name: 'ST_Force3D', value: 'ST_Force3D()', meta: 'GIS function' },
  { name: 'ST_FrechetDistance', value: 'ST_FrechetDistance()', meta: 'GIS function' },
  { name: 'ST_GeoHash', value: 'ST_GeoHash()', meta: 'GIS function' },
  { name: 'ST_GeometricMedian', value: 'ST_GeometricMedian()', meta: 'GIS function' },
  { name: 'ST_GeometryN', value: 'ST_GeometryN()', meta: 'GIS function' },
  { name: 'ST_GeometryType', value: 'ST_GeometryType()', meta: 'GIS function' },
  { name: 'ST_H3CellDistance', value: 'ST_H3CellDistance()', meta: 'H3 function' },
  { name: 'ST_H3CellIDs', value: 'ST_H3CellIDs()', meta: 'H3 function' },
  { name: 'ST_H3KRing', value: 'ST_H3KRing()', meta: 'H3 function' },
  { name: 'ST_H3ToGeom', value: 'ST_H3ToGeom()', meta: 'H3 function' },
  { name: 'ST_HausdorffDistance', value: 'ST_HausdorffDistance()', meta: 'GIS function' },
  { name: 'ST_InteriorRingN', value: 'ST_InteriorRingN()', meta: 'GIS function' },
  { name: 'ST_Intersection', value: 'ST_Intersection()', meta: 'GIS function' },
  { name: 'ST_IsClosed', value: 'ST_IsClosed()', meta: 'GIS function' },
  { name: 'ST_IsCollection', value: 'ST_IsCollection()', meta: 'GIS function' },
  { name: 'ST_IsEmpty', value: 'ST_IsEmpty()', meta: 'GIS function' },
  { name: 'ST_IsRing', value: 'ST_IsRing()', meta: 'GIS function' },
  { name: 'ST_IsSimple', value: 'ST_IsSimple()', meta: 'GIS function' },
  { name: 'ST_IsValid', value: 'ST_IsValid()', meta: 'GIS function' },
  { name: 'ST_Length', value: 'ST_Length()', meta: 'GIS function' },
  { name: 'ST_LengthSpheroid', value: 'ST_LengthSpheroid()', meta: 'GIS function' },
  { name: 'ST_LineFromMultiPoint', value: 'ST_LineFromMultiPoint()', meta: 'GIS function' },
  { name: 'ST_LineInterpolatePoint', value: 'ST_LineInterpolatePoint()', meta: 'GIS function' },
  { name: 'ST_LineMerge', value: 'ST_LineMerge()', meta: 'GIS function' },
  { name: 'ST_LineSubstring', value: 'ST_LineSubstring()', meta: 'GIS function' },
  { name: 'ST_MakeLine', value: 'ST_MakeLine()', meta: 'GIS function' },
  { name: 'ST_MakePolygon', value: 'ST_MakePolygon()', meta: 'GIS function' },
  { name: 'ST_MakeValid', value: 'ST_MakeValid()', meta: 'GIS function' },
  { name: 'ST_MinimumBoundingCircle', value: 'ST_MinimumBoundingCircle()', meta: 'GIS function' },
  { name: 'ST_MinimumBoundingRadius', value: 'ST_MinimumBoundingRadius()', meta: 'GIS function' },
  { name: 'ST_Multi', value: 'ST_Multi()', meta: 'GIS function' },
  { name: 'ST_NDims', value: 'ST_NDims()', meta: 'GIS function' },
  { name: 'ST_Normalize', value: 'ST_Normalize()', meta: 'GIS function' },
  { name: 'ST_NPoints', value: 'ST_NPoints()', meta: 'GIS function' },
  { name: 'ST_NRings', value: 'ST_NRings()', meta: 'GIS function' },
  { name: 'ST_NumGeometries', value: 'ST_NumGeometries()', meta: 'GIS function' },
  { name: 'ST_NumInteriorRings', value: 'ST_NumInteriorRings()', meta: 'GIS function' },
  { name: 'ST_NumPoints', value: 'ST_NumPoints()', meta: 'GIS function' },
  { name: 'ST_PointN', value: 'ST_PointN()', meta: 'GIS function' },
  { name: 'ST_PointOnSurface', value: 'ST_PointOnSurface()', meta: 'GIS function' },
  { name: 'ST_Polygon', value: 'ST_Polygon()', meta: 'GIS function' },
  { name: 'ST_ReducePrecision', value: 'ST_ReducePrecision()', meta: 'GIS function' },
  { name: 'ST_RemovePoint', value: 'ST_RemovePoint()', meta: 'GIS function' },
  { name: 'ST_Reverse', value: 'ST_Reverse()', meta: 'GIS function' },
  { name: 'ST_S2CellIDs', value: 'ST_S2CellIDs()', meta: 'GIS function' },
  { name: 'ST_SetPoint', value: 'ST_SetPoint()', meta: 'GIS function' },
  { name: 'ST_SetSRID', value: 'ST_SetSRID()', meta: 'GIS function' },
  { name: 'ST_SimplifyPreserveTopology', value: 'ST_SimplifyPreserveTopology()', meta: 'GIS function' },
  { name: 'ST_Split', value: 'ST_Split()', meta: 'GIS function' },
  { name: 'ST_SRID', value: 'ST_SRID()', meta: 'GIS function' },
  { name: 'ST_StartPoint', value: 'ST_StartPoint()', meta: 'GIS function' },
  { name: 'ST_SubDivide', value: 'ST_SubDivide()', meta: 'GIS function' },
  { name: 'ST_SubDivideExplode', value: 'ST_SubDivideExplode()', meta: 'GIS function' },
  { name: 'ST_SymDifference', value: 'ST_SymDifference()', meta: 'GIS function' },
  { name: 'ST_Transform', value: 'ST_Transform()', meta: 'GIS function' },
  { name: 'ST_Translate', value: 'ST_Translate()', meta: 'GIS function' },
  { name: 'ST_Union', value: 'ST_Union()', meta: 'GIS function' },
  { name: 'ST_VoronoiPolygons', value: 'ST_VoronoiPolygons()', meta: 'GIS function' },
  { name: 'ST_X', value: 'ST_X()', meta: 'GIS function' },
  { name: 'ST_XMax', value: 'ST_XMax()', meta: 'GIS function' },
  { name: 'ST_XMin', value: 'ST_XMin()', meta: 'GIS function' },
  { name: 'ST_Y', value: 'ST_Y()', meta: 'GIS function' },
  { name: 'ST_YMax', value: 'ST_YMax()', meta: 'GIS function' },
  { name: 'ST_YMin', value: 'ST_YMin()', meta: 'GIS function' },
  { name: 'ST_Z', value: 'ST_Z()', meta: 'GIS function' },
  { name: 'ST_ZMax', value: 'ST_ZMax()', meta: 'GIS function' },
  { name: 'ST_ZMin', value: 'ST_ZMin()', meta: 'GIS function' },

  // H3 Functions (duplicates above given separate meta)
  { name: 'ST_H3CellDistance', value: 'ST_H3CellDistance()', meta: 'H3 function' },
  { name: 'ST_H3CellIDs', value: 'ST_H3CellIDs()', meta: 'H3 function' },
  { name: 'ST_H3KRing', value: 'ST_H3KRing()', meta: 'H3 function' },
  { name: 'ST_H3ToGeom', value: 'ST_H3ToGeom()', meta: 'H3 function' },

  // Raster Functions
  { name: 'RS_PixelAsCentroid', value: 'RS_PixelAsCentroid()', meta: 'Raster function' },
  { name: 'RS_PixelAsCentroids', value: 'RS_PixelAsCentroids()', meta: 'Raster function' },
  { name: 'RS_PixelAsPoint', value: 'RS_PixelAsPoint()', meta: 'Raster function' },
  { name: 'RS_PixelAsPoints', value: 'RS_PixelAsPoints()', meta: 'Raster function' },
  { name: 'RS_PixelAsPolygon', value: 'RS_PixelAsPolygon()', meta: 'Raster function' },
  { name: 'RS_PixelAsPolygons', value: 'RS_PixelAsPolygons()', meta: 'Raster function' },
  { name: 'RS_Envelope', value: 'RS_Envelope()', meta: 'Raster function' },
  { name: 'RS_ConvexHull', value: 'RS_ConvexHull()', meta: 'Raster function' },
  { name: 'RS_MinConvexHull', value: 'RS_MinConvexHull()', meta: 'Raster function' },
  { name: 'RS_BandPath', value: 'RS_BandPath()', meta: 'Raster function' },
  { name: 'RS_GeoReference', value: 'RS_GeoReference()', meta: 'Raster function' },
  { name: 'RS_GeoTransform', value: 'RS_GeoTransform()', meta: 'Raster function' },
  { name: 'RS_Height', value: 'RS_Height()', meta: 'Raster function' },
  { name: 'RS_RasterToWorldCoordX', value: 'RS_RasterToWorldCoordX()', meta: 'Raster function' },
  { name: 'RS_RasterToWorldCoordY', value: 'RS_RasterToWorldCoordY()', meta: 'Raster function' },
  { name: 'RS_RasterToWorldCoord', value: 'RS_RasterToWorldCoord()', meta: 'Raster function' },
  { name: 'RS_Rotation', value: 'RS_Rotation()', meta: 'Raster function' },
  { name: 'RS_ScaleX', value: 'RS_ScaleX()', meta: 'Raster function' },
  { name: 'RS_ScaleY', value: 'RS_ScaleY()', meta: 'Raster function' },
  { name: 'RS_SkewX', value: 'RS_SkewX()', meta: 'Raster function' },
  { name: 'RS_SkewY', value: 'RS_SkewY()', meta: 'Raster function' },
  { name: 'RS_UpperLeftX', value: 'RS_UpperLeftX()', meta: 'Raster function' },
  { name: 'RS_UpperLeftY', value: 'RS_UpperLeftY()', meta: 'Raster function' },
  { name: 'RS_Width', value: 'RS_Width()', meta: 'Raster function' },
  { name: 'RS_WorldToRasterCoord', value: 'RS_WorldToRasterCoord()', meta: 'Raster function' },
  { name: 'RS_WorldToRasterCoordX', value: 'RS_WorldToRasterCoordX()', meta: 'Raster function' },
  { name: 'RS_WorldToRasterCoordY', value: 'RS_WorldToRasterCoordY()', meta: 'Raster function' },
  { name: 'RS_Band', value: 'RS_Band()', meta: 'Raster function' },
  { name: 'RS_BandNoDataValue', value: 'RS_BandNoDataValue()', meta: 'Raster function' },
  { name: 'RS_BandIsNoData', value: 'RS_BandIsNoData()', meta: 'Raster function' },
  { name: 'RS_BandPixelType', value: 'RS_BandPixelType()', meta: 'Raster function' },
  { name: 'RS_Count', value: 'RS_Count()', meta: 'Raster function' },
  { name: 'RS_SummaryStats', value: 'RS_SummaryStats()', meta: 'Raster function' },
  { name: 'RS_SummaryStatsAll', value: 'RS_SummaryStatsAll()', meta: 'Raster function' },
  { name: 'RS_ZonalStats', value: 'RS_ZonalStats()', meta: 'Raster function' },
  { name: 'RS_ZonalStatsAll', value: 'RS_ZonalStatsAll()', meta: 'Raster function' },
  { name: 'RS_Contains', value: 'RS_Contains()', meta: 'Raster function' },
  { name: 'RS_Intersects', value: 'RS_Intersects()', meta: 'Raster function' },
  { name: 'RS_Within', value: 'RS_Within()', meta: 'Raster function' },
  { name: 'RS_AddBand', value: 'RS_AddBand()', meta: 'Raster function' },
  { name: 'RS_Clip', value: 'RS_Clip()', meta: 'Raster function' },
  { name: 'RS_Interpolate', value: 'RS_Interpolate()', meta: 'Raster function' },
  { name: 'RS_MetaData', value: 'RS_MetaData()', meta: 'Raster function' },
  { name: 'RS_NormalizeAll', value: 'RS_NormalizeAll()', meta: 'Raster function' },
  { name: 'RS_NumBands', value: 'RS_NumBands()', meta: 'Raster function' },
  { name: 'RS_ReprojectMatch', value: 'RS_ReprojectMatch()', meta: 'Raster function' },
  { name: 'RS_Resample', value: 'RS_Resample()', meta: 'Raster function' },
  { name: 'RS_SetBandNoDataValue', value: 'RS_SetBandNoDataValue()', meta: 'Raster function' },
  { name: 'RS_SetGeoReference', value: 'RS_SetGeoReference()', meta: 'Raster function' },
  { name: 'RS_SetPixelType', value: 'RS_SetPixelType()', meta: 'Raster function' },
  { name: 'RS_SetValue', value: 'RS_SetValue()', meta: 'Raster function' },
  { name: 'RS_SetValues', value: 'RS_SetValues()', meta: 'Raster function' },
  { name: 'RS_SetSRID', value: 'RS_SetSRID()', meta: 'Raster function' },
  { name: 'RS_SRID', value: 'RS_SRID()', meta: 'Raster function' },
  { name: 'RS_StackTileExplode', value: 'RS_StackTileExplode()', meta: 'Raster function' },
  { name: 'RS_Union', value: 'RS_Union()', meta: 'Raster function' },
  { name: 'RS_Value', value: 'RS_Value()', meta: 'Raster function' },
  { name: 'RS_Values', value: 'RS_Values()', meta: 'Raster function' },
  { name: 'RS_AsInDb', value: 'RS_AsInDb()', meta: 'Raster function' },
  { name: 'RS_Tile', value: 'RS_Tile()', meta: 'Raster function' },
  { name: 'RS_TileExplode', value: 'RS_TileExplode()', meta: 'Raster function' },
  { name: 'RS_BandAsArray', value: 'RS_BandAsArray()', meta: 'Raster function' },
  { name: 'RS_AddBandFromArray', value: 'RS_AddBandFromArray()', meta: 'Raster function' },
  { name: 'RS_MapAlgebra', value: 'RS_MapAlgebra()', meta: 'Raster function' },
  { name: 'RS_Add', value: 'RS_Add()', meta: 'Raster function' },
  { name: 'RS_Array', value: 'RS_Array()', meta: 'Raster function' },
  { name: 'RS_BitwiseAND', value: 'RS_BitwiseAND()', meta: 'Raster function' },
  { name: 'RS_BitwiseOR', value: 'RS_BitwiseOR()', meta: 'Raster function' },
  { name: 'RS_CountValue', value: 'RS_CountValue()', meta: 'Raster function' },
  { name: 'RS_Divide', value: 'RS_Divide()', meta: 'Raster function' },
  { name: 'RS_FetchRegion', value: 'RS_FetchRegion()', meta: 'Raster function' },
  { name: 'RS_GreaterThan', value: 'RS_GreaterThan()', meta: 'Raster function' },
  { name: 'RS_GreaterThanEqual', value: 'RS_GreaterThanEqual()', meta: 'Raster function' },
  { name: 'RS_LessThan', value: 'RS_LessThan()', meta: 'Raster function' },
  { name: 'RS_LessThanEqual', value: 'RS_LessThanEqual()', meta: 'Raster function' },
  { name: 'RS_LogicalDifference', value: 'RS_LogicalDifference()', meta: 'Raster function' },
  { name: 'RS_LogicalOver', value: 'RS_LogicalOver()', meta: 'Raster function' },
  { name: 'RS_Mean', value: 'RS_Mean()', meta: 'Raster function' },
  { name: 'RS_Mode', value: 'RS_Mode()', meta: 'Raster function' },
  { name: 'RS_Modulo', value: 'RS_Modulo()', meta: 'Raster function' },
  { name: 'RS_Multiply', value: 'RS_Multiply()', meta: 'Raster function' },
  { name: 'RS_MultiplyFactor', value: 'RS_MultiplyFactor()', meta: 'Raster function' },
  { name: 'RS_Normalize', value: 'RS_Normalize()', meta: 'Raster function' },
  { name: 'RS_NormalizedDifference', value: 'RS_NormalizedDifference()', meta: 'Raster function' },
  { name: 'RS_SquareRoot', value: 'RS_SquareRoot()', meta: 'Raster function' },
  { name: 'RS_Subtract', value: 'RS_Subtract()', meta: 'Raster function' },

  // Raster Inference Functions
  { name: 'RS_CLASSIFY', value: 'RS_CLASSIFY()', meta: 'Inference function' },
  { name: 'RS_MAX_CONFIDENCE', value: 'RS_MAX_CONFIDENCE()', meta: 'Inference function' },
  { name: 'RS_SEGMENT', value: 'RS_SEGMENT()', meta: 'Inference function' },
  { name: 'RS_DETECT_BBOXES', value: 'RS_DETECT_BBOXES()', meta: 'Inference function' },
  { name: 'RS_FILTER_BOX_CONFIDENCE', value: 'RS_FILTER_BOX_CONFIDENCE()', meta: 'Inference function' },
  { name: 'RS_TEXT_TO_BBOXES', value: 'RS_TEXT_TO_BBOXES()', meta: 'Inference function' },
  { name: 'RS_TEXT_TO_SEGMENTS', value: 'RS_TEXT_TO_SEGMENTS()', meta: 'Inference function' }
]
