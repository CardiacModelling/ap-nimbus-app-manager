# If the FROM is changed then server.js's OPTION's help facility may require
# modification to reflect different ApPredict help or lookup availability.
FROM cardiacmodelling/appredict-with-emulators:2.0.0

ARG node_version=20

USER root

RUN apt-get update && \
    apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_${node_version}.x -o nodesource_setup.sh && \
    bash nodesource_setup.sh && \
    apt-get install -y nodejs && \
    rm -f nodesource_setup.sh && \
    apt-get remove -y --purge git && \
    apt-get install -y --no-install-recommends \
    inotify-tools \
    jq \
    libonig-dev && \
    rm -rf /var/lib/apt/lists/*

RUN npm install --global npm@10.7.0

RUN mkdir -p /home/appredict/apps/app-manager/node_modules/ && \
    chown -R appredict:appredict /home/appredict/apps/app-manager

################################################################################
# Install rest of app.                                                         #
################################################################################

COPY --chown=appredict:appredict kick_off.sh convert.sh package.json package-lock.json run_me.sh server.js /home/appredict/apps/app-manager/

WORKDIR /home/appredict/apps/app-manager

USER appredict

RUN chmod +x /home/appredict/apps/app-manager/*.sh

RUN npm ci

EXPOSE 8080

CMD ["./kick_off.sh"]
