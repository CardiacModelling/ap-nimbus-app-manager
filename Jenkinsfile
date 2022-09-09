node {
  stage('Checkout') {
    checkout scm
  }
  stage('Build') {
    dir('app-manager') {
      sh "docker build --build-arg build_processors=${PROC_COUNT} -t app-manager:jenkinslatest -f Dockerfile ."
    }
  }
}
