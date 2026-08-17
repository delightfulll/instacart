# buld then run the dockerfile
FROM node:22-alpine

# starting witn a clean directory
WORKDIR /app

# copy packages into the new directoy 
COPY package*.json ./


#use npm ci so it matches exactlh with json.lock, run means to install in build =
RUN npm ci

# copy our entire backednd folder to the app directoy

#when we build we give it context
COPY . .

# to start API use cmd
CMD ["npm", "start"]







