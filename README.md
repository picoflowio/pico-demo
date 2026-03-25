## Description
This the a non-trivial demonstration project how to use picoflow, the Conversational Agentic flow.
This is a Hotel reservation using Purposeful Chatbot mechanism for Hilton Hotels.

We have also created a simulation of pricing engine that takes into considerations of weekends, holidays, months, etc.

## Project setup
```bash
$ yarn install
```

## Document DB setup
In order to run this project, you need to decide to use a MongoDB or a CosmoDB.
Both have support locally or in the Cloud.


For HotelFlow, you need:
Create 2 collections for your document DB:
```text
hotels
sessions
```

Upload a hotel database 
```text
hotels-cosmo.json (for Cosmo) 
hotels-mongo.json (for Mongo)
```

These two json files are under `src/myflow/hotel-flow/data`


## Compile and run the project
```bash
# development
$ yarn start
```


## License Key
Get a trial license goto `www.@picoflow.io`, look at the Q/A sections

# Environment variables:
.env.example - Copy to .env and fill in values

```text
PICOFLOW_KEY=
GEMINI_KEY=
OPENAI_KEY=
ANTHROPIC_KEY=

LLM_RETRY=3
LLM_TEMPERATURE=0.2
SESSION_EXPIRATION=50000

DOCUMENT_DB=COSMO
# DOCUMENT_DB=MONGO

COSMODB_KEY=C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnZ0a==
COSMODB_URL=http://localhost:8081/
COSMODB_ID=picoflow
COSMODB_SESSION_ID=sessions

#MONGODB_NAME=picoflow
#MONGODB_COLLECTION=sessions
#MONGODB_URL=mongodb://localhost:27017/?directConnection=true
```

## Endpoints
You can go to http://localhost:8000/ai/run

Each turn, you want to take the `CHAT_SESSION_ID` from the response header and use that in the request header for next turn.

Leave `CHAT_SESSION_ID` blank when you make the first call. A new session and ID will be created and returned. 


