# If the FROM is changed then server.js's OPTION's help facility may require
# modification to reflect different ApPredict help or lookup availability.
FROM cardiacmodelling/appredict-with-emulators:0.0.10

ARG build_processors=1
ARG node_version=18.12.1

USER root

RUN apt-get update && \
    apt-get remove -y --purge git && \
    apt-get install -y --no-install-recommends \
    inotify-tools \
    jq \
    libonig-dev && \
    rm -rf /var/lib/apt/lists/*

RUN mkdir -p /home/appredict/apps/app-manager/node_modules/ /home/appredict/apps/node/ && \
    chown -R appredict:appredict /home/appredict/apps/app-manager /home/appredict/apps/node


################################################################################
# 1. Fix node version (i.e. don't rely on apk version)                         #
################################################################################

RUN cd /home/appredict/apps/node/ && \
    wget https://nodejs.org/dist/v${node_version}/node-v${node_version}.tar.gz && \
    tar -zxvf node-v${node_version}.tar.gz

RUN cd /home/appredict/apps/node/node-v${node_version} && \
    ./configure --prefix=/home/appredict/apps/node/v${node_version} && \
    make -j${build_processors} && \
    make install && \
    rm -rf /home/appredict/apps/node/node-v${node_version}* && \
    chown -R appredict:appredict /home/appredict/apps/node && \
    chmod o+rX /home/appredict/apps/node

################################################################################
# 2. Install rest of app.                                                      #
################################################################################

COPY --chown=appredict:appredict kick_off.sh convert.sh package.json package-lock.json run_me.sh server.js /home/appredict/apps/app-manager/

WORKDIR /home/appredict/apps/app-manager

USER appredict

ENV PATH=/home/appredict/apps/node/v${node_version}/bin:${PATH}

RUN chmod +x /home/appredict/apps/app-manager/*.sh

RUN npm ci

RUN npm install -g npm@9.1.2

EXPOSE 8080

CMD ["./kick_off.sh"]
