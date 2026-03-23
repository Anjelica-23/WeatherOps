import geopandas as gpd

gdf = gpd.read_file("data/dehradun_roads_clipped.gpkg")
print(len(gdf))