# If the FROM is changed then server.js's OPTION's help facility may require
# modification to reflect different ApPredict help or lookup availability.
FROM cardiacmodelling/appredict-with-emulators:0.0.9

ARG build_processors=1

USER root

RUN apk add --no-cache inotify-tools jq oniguruma linux-headers

RUN mkdir -p /home/appredict/apps/app-manager/node_modules/ /home/appredict/apps/node/ && \
    chown -R appredict:appredict /home/appredict/apps/app-manager /home/appredict/apps/node

################################################################################
# 1. Fix node version (i.e. don't rely on apk version)                         #
################################################################################

RUN cd /home/appredict/apps/node/ && \
    wget https://nodejs.org/dist/v16.13.0/node-v16.13.0.tar.gz && \
    tar -zxvf node-v16.13.0.tar.gz

RUN cd /home/appredict/apps/node/node-v16.13.0 && \
    ./configure --prefix=/home/appredict/apps/node/v16.13.0 && \
    make -j${build_processors} && \
    make install && \
    rm -rf /home/appredict/apps/node/node-v16.13.0* && \
    chown -R appredict:appredict /home/appredict/apps/node && \
    chmod o+rX /home/appredict/apps/node

################################################################################
# 2. Install rest of app.                                                      #
################################################################################

COPY --chown=appredict:appredict kick_off.sh convert.sh package.json package-lock.json run_me.sh server.js /home/appredict/apps/app-manager/

RUN apk del linux-headers

WORKDIR /home/appredict/apps/app-manager

USER appredict

ENV PATH=/home/appredict/apps/node/v16.13.0/bin:${PATH}

RUN npm ci

EXPOSE 8080

CMD ["./kick_off.sh"]
