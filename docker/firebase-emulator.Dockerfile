FROM eclipse-temurin:21-jre-jammy AS java

FROM node:24-bookworm-slim

COPY --from=java /opt/java/openjdk /opt/java/openjdk
ENV JAVA_HOME=/opt/java/openjdk
ENV PATH="${JAVA_HOME}/bin:${PATH}"
ENV CI=true
ENV FIREBASE_CLI_DISABLE_UPDATE_CHECK=true

ARG FIREBASE_TOOLS_VERSION=15.34.2
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global firebase-tools@${FIREBASE_TOOLS_VERSION} \
    && npm cache clean --force \
    && firebase setup:emulators:firestore \
    && firebase setup:emulators:ui

WORKDIR /workspace
COPY docker/start-emulators.sh /usr/local/bin/start-emulators
ENTRYPOINT ["sh", "/usr/local/bin/start-emulators"]
