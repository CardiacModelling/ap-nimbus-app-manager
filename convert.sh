#!/bin/bash -e

# This is the top of the directory where ApPredict runs. This script watches
# files/directories changing in this "run" directory, and if one of interest
# changes then it's likely to be read in, processed, and written out to the
# "results" directory in json format.
run_dir=run/
# This is the top of the directory where this script writes json-formatted
# files to. What is likely to be happening is the the node application will
# be watching and reacting to files changing in this directory, not in the
# "run" directory.
res_dir=res/

# Avoid output
pushd () {
  command pushd "$@" > /dev/null
}

popd () {
  command popd "$@" > /dev/null
}

function mk_out_dir {
  in_dir=$1

  out_dir=${in_dir/$run_dir/$res_dir}
  if [ ! -d ${out_dir} ]; then
    mkdir -p ${out_dir}
  fi

  echo ${out_dir}
}

function process_progress {
  in_dir=$1
  in_file=$2

  file_read=${in_dir}${in_file}
  out_dir=$(mk_out_dir ${in_dir})
  file_tmp=${out_dir}progress_status.tmp
  file_write=${out_dir}progress_status.json

  if [ -f ${file_read} ]; then
    # -R : Don't parse input as JSON
    # -s : Read entire input stream
    # -c : Compact output

    jq -R -s -c 'split("\n")' <${file_read} >${file_tmp}
    # Ensure a single file action which node (i.e. chokidar) can watch and act on!
    mv ${file_tmp} ${file_write}
  else
    # Upon run_me.sh completion the "run" directory is deleted so some files may
    # be getting deleted before they can be read. Ignore in the case of progress!
    if [ "${in_file}" != "progress_status.txt" ]; then
      echo ""
      echo "  File ${file_read} not available!"
      echo ""
    fi
  fi
}

function process_pkpd_results {
  in_dir=$1
  in_file=$2

  file_read=${in_dir}${in_file}
  out_dir=$(mk_out_dir ${in_dir})
  file_tmp=${out_dir}pkpd_results.tmp
  file_write=${out_dir}pkpd_results.json

  if [ -f ${file_read} ]; then
    jq -R -c '[inputs | split("\t") | {timepoint: .[0], apd90: .[1:]}]' <${file_read} >${file_tmp}
    # Ensure a single file action which node (i.e. chokidar) can watch and act on!
    mv ${file_tmp} ${file_write}
  fi
}

function process_qnet {
  in_dir=$1
  in_file=$2

  file_read=${in_dir}${in_file}
  out_dir=$(mk_out_dir ${in_dir})
  file_tmp=${out_dir}q_net.tmp
  file_write=${out_dir}q_net.json

  if [ -f ${file_read} ]; then
    jq -R -c '[inputs | split("\t") | {c: .[0], qnet: .[1]}]' <${file_read} >${file_tmp}
    # Ensure a single file action which node (i.e. chokidar) can watch and act on!
    mv ${file_tmp} ${file_write}
  fi
}


function process_messages {
  in_dir=$1
  in_file=$2

  file_read=${in_dir}${in_file}
  out_dir=$(mk_out_dir ${in_dir})
  file_tmp=${out_dir}messages.tmp
  file_write=${out_dir}messages.json

  if [ -f ${file_read} ]; then
    # https://stackoverflow.com/questions/26287130/converting-lines-to-json-in-bash
    jq -nR [inputs] <${file_read} >${file_tmp}
    # Ensure a single file action which node (i.e. chokidar) can watch and act on!
    mv ${file_tmp} ${file_write}
  fi
}

function process_voltage_results {
  in_dir=$1
  in_file=$2

  file_read=${in_dir}${in_file}
  out_dir=$(mk_out_dir ${in_dir})
  file_tmp=${out_dir}voltage_results.tmp
  file_write=${out_dir}voltage_results.json

  if [ -f ${file_read} ]; then
    # The presence of the additional .da90 split is for when there's a CSV format
    # for DeltaAPD90 on credible intervals. Converts CSV to an array of values.

    # 1. `echo` the header line
    # 2. `cat` the header line and the main file, i.e. duplicate the header line
    # 3. Run jq with -R option to ignore first line... because otherwise it fails!
    echo $(head -n 1 ${file_read}) | \
      cat - ${file_read} | \
      jq -R -c '[inputs | split("\t") | {c: .[0], uv: .[1], pv: .[2], a50: .[3], a90: .[4], da90: .[5]} | .da90 |= split(",")]' >${file_tmp}

    # Ensure a single file action which node (i.e. chokidar) can watch and act on!
    mv ${file_tmp} ${file_write}
  fi
}

function process_voltage_trace {
  in_dir=$1
  in_file=$2

  file_read=${in_dir}${in_file}
  out_dir=$(mk_out_dir ${in_dir})
  # Swap the file extension in the var from .dat to .json
  renamed=${in_file/.dat/.json}
  file_write=${out_dir}${renamed}

  if [ -f ${file_read} ]; then
    # Convert tsv to json
    jq -R -c '[ inputs | split("\t") | {name: .[0]|tonumber, value: .[1]|tonumber} ]' <${file_read} >${file_write}
    # Extract compound conc from the file name.
    concentration=$(echo ${in_file} | awk -F_ '{print $2}')
    # Wrap orig json with additional json in output file (i.e. embed array in obj)
    sed -i "1s/\(.*\)/{\"name\":\"${concentration}\",\"series\":\1}/" ${file_write}

    # Concatenate the individual voltage_traces into a single file.
    pushd ${out_dir}
    find -maxdepth 1 -name "conc_*_voltage_trace.json" | sort -n -k1.8 | xargs jq -c -n '[inputs]' > voltage_traces.tmp
    # Ensure a single file action which node (i.e. chokidar) can watch and act on!
    mv voltage_traces.tmp voltage_traces.json
    popd
  else
    # TODO: Noticed (mainly in virtualbox VM env) that a single .dat files very occasionally
    #         generate two of these events, usually 0.08-0.1s apart - don't know why.
    #       Normally it's not a problem as the jq conversion happens twice with minimal side-effect,
    #         but the second event sometimes appears after final concentration processing and the
    #         in_file file has already been deleted (by run_me.sh) - again, don't know why or how -
    #         so this 'else' clause is to catch such situations. It's inconsequential as the first
    #         event generated the output json file.
    if [ ! -f ${file_write} ]; then
      echo ""
      echo "  File ${file_write} not written!"
      echo ""
    fi
  fi
}

unset IFS

if [ ! -d ${run_dir} ]; then
  mkdir -p ${run_dir}
fi

inotifywait -m -r -e close_write -e modify -e delete ${run_dir} | \
  while read dir event file
    do
      if [[ "${event}" == 'MODIFY' ]]; then
        if [[ "${file}" == 'progress_status.txt' ]]; then
          process_progress ${dir} ${file}
        elif [[ "${file}" == 'voltage_results.dat' ]]; then
          process_voltage_results ${dir} ${file}
        elif [[ "${file}" == 'q_net.txt' ]]; then
          process_qnet ${dir} ${file}
        elif [[ "${file}" == 'messages.txt' ]]; then
          process_messages ${dir} ${file}
        elif [[ "${file}" == 'pkpd_results.txt' ]]; then
          process_pkpd_results ${dir} ${file}
        fi
      else
        [[ "${event}" == 'CLOSE_WRITE,CLOSE' && "${file}" == conc_*_voltage_trace.dat ]] && \
          process_voltage_trace ${dir} ${file}

        [[ "${event}" == 'DELETE,ISDIR' && "${file}" == 'ApPredict_output' ]] && \
          touch $(mk_out_dir ${dir})${file}/STOP
      fi
    done
