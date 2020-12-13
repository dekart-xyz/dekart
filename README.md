# dekart
Visualize Data from BigQuery on a map with kepler.gl and share it in your org


## run server

```
cp .env.example .env
docker-compose --env-file .env up
godotenv -f .env go run ./src/server/main.go
```
