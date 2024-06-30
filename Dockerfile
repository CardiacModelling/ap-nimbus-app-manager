# If the FROM is changed then server.js's OPTION's help facility may require
# modification to reflect different ApPredict help or lookup availability.
FROM cardiacmodelling/appredict-with-emulators:2.0.0

ARG node_version=20

USER root

RUN apt-get update && \
    apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_${node_version}.x \
         -o nodesource_setup.sh && \
    bash nodesource_setup.sh && \
    apt-get install -y nodejs && \
    rm -f nodesource_setup.sh && \
    apt-get remove -y --purge git && \
    apt-get install -y --no-install-recommends \
    inotify-tools \
    jq \
    libonig-dev && \
    rm -rf /var/lib/apt/lists/*

RUN npm install -g npm@10.8.1

################################################################################
# Install rest of app.                                                         #
################################################################################

USER appredict

RUN mkdir -p /home/appredict/apps/app-manager/node_modules/

WORKDIR /home/appredict/apps/app-manager

COPY --chown=appredict:appredict *.sh *.json *.js ./

RUN chmod +x *.sh

RUN npm ci

EXPOSE 8080

CMD ["./kick_off.sh"]
