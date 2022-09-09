#!/bin/bash
#
# Not setting to `-e` above so that any problem with ApPredict invocation or
# runtime will result in the removal of the run directory.
#

# Set run and results directories to unique (by virtue of it being named by
# the simulation id) non-existent directories.
# These directory values do NOT have trailing path separators.
run_dir=$1
res_dir=$2
appredict_output_dir=$3

# ApPredict args
appredict_args="${@:4}"

argCnt=$#

if [ "${argCnt}" -lt 4 ]; then
  echo ""
  echo "ERROR : Incorrect ./run_me.sh invocation from server.js"
  echo "ERROR : Expected at lease 4 args, but ${argCnt} supplied!"
  echo ""
  exit 1
fi

if [ -d ${res_dir} ]; then
  echo "ERROR : Results directory must not exist prior to ApPredict invocation!"
  exit 2
fi

output_dir=${res_dir}/${appredict_output_dir}
mkdir -p ${output_dir}

if [ -d ${run_dir} ]; then
  echo "ERROR : Run directory must not exist prior to ApPredict invocation!" >> ${output_dir}/STDERR
  exit 3
fi
mkdir -p ${run_dir}

pushd ${run_dir}

appredict_home="/home/appredict/apps/ApPredict"
appredict="${appredict_home}/ApPredict.sh"

if [ ! -e "${appredict}" ]; then
  # May end up here if script is not being run in a container!
  echo "ERROR : Failed to find ${appredict}"

  echo "${appredict} not found!" >> ${output_dir}/STDERR
  # Provisional "failure to run" mechanism....
  # server.js doesn't react to progress file creation, only modification!
  touch ${output_dir}/progress_status.json
  # Wait a second to allow watching mechanism to acknowledge a separate creation and modification!
  sleep 1
  echo "[ \"** Error! app-manager's run_me.sh could not find ${appredict}! **\" ]" > ${output_dir}/progress_status.json
  # Delay to try to capture above progress in UI before UI stops polling.
  sleep 9
else
  # If there are any emulator files then symlink them to run dir.
  if [ "$(find ${appredict_home}/ -maxdepth 1 -name '*.arch' | wc -l)" -gt 0 ]; then
    ln -s ${appredict_home}/*.arch .
    # Don't bother with the manifest file as it either; gets ignored if no
    # internet access, or replaced if internet access. See
    # https://github.com/Chaste/ApPredict/blob/master/src/lookup/LookupTableLoader.cpp
  fi

  # Record the ApPredict args for posterity!
  echo "ApPredict args : ${appredict_args}" >> ${output_dir}/STDOUT

  CHASTE_TEST_OUTPUT=${run_dir} ${appredict} ${appredict_args}

  retVal=$?
  if [ ${retVal} -ne 0 ]; then
    # Could have arrived here prior to first conc or towards end of sim!
    echo "${appredict} run failed!" >> ${output_dir}/STDERR
    # Delay to try to capture above progress in UI before UI stops polling.
    sleep 10
  fi
fi

popd

# Sure-fire indicator that simulation has finished (to ensure UI stops polling)
echo "" >> ${output_dir}/STOP

# In some circumstances the presence of files in ${run_dir} (e.g. .nfs files)
# may cause the run dir removal to fail (albeit not a show-stopper, just
# leaves an untidy legacy).
# Adding a small delay to allow filesystem tidy-up prior to removal.
#
# ** Changing the value below? Update setTimeout in client-direct/src/app/results/results.component.ts **
sleep 1

rm -rf ${run_dir}
