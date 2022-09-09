/**
 * Serve app-manager operations.
 */
"use strict";

const exec = require('child_process').exec;
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const uuidv4 = require('uuid/v4');
const chokidar = require('chokidar');
const tiny = require('tiny-json-http');
const ip = require('ip');

// These directory names are also referenced in other scripts!
const DIR_APPREDICT_RESULTS = concatenator([ __dirname, 'res'], false);
const DIR_APPREDICT_RUN = concatenator([ __dirname, 'run'], false);
const DIR_UPLOADED_FILES = concatenator([ __dirname, 'uploaded_files'], false); 

if (!fs.existsSync(DIR_UPLOADED_FILES)){  // make sure dir for uploaded files exist
    fs.mkdirSync(DIR_UPLOADED_FILES);
}

// It is assumed that the REST_API_URL_DATA value (if defined) ends with a '/'!
var rest_api_url_data;
const REST_API_URL_COLLECTION = 'api/collection';
const REST_API_URL_COLLECTIONS = 'api/collections';

const RUNME_SCRIPT = './run_me.sh';

/**************************** OPTIONS help texts    ***************************/

const HELP_APPREDICT = `Copyright (c) 2005-2020, University of Oxford.
All rights reserved.

University of Oxford means the Chancellor, Masters and Scholars of the
University of Oxford, having an administrative office at Wellington
Square, Oxford OX1 2JD, UK.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:
 * Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.
 * Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.
 * Neither the name of the University of Oxford nor the names of its
   contributors may be used to endorse or promote products derived from this
   software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE
GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT
LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT
OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

This version of Chaste was compiled on:
Thu, 16 Jul 2020 08:55:38 +0000 by Linux a35b77f7ac32 4.15.0-55-generic #60-Ubuntu SMP Tue Jul 2 18:22:20 UTC 2019 x86_64 (uname)
from revision number 9c205f0 with build type GccOpt, shared libraries.

# 0 arguments supplied.

***********************************************************************************************
* ApPredict::Please provide some of these inputs:
*
* EITHER --model
*   options: 1 = Shannon, 2 = TenTusscher (06), 3 = Mahajan,
*            4 = Hund-Rudy, 5 = Grandi, 6 = O'Hara-Rudy 2011 (endo),
*            7 = Paci (ventricular), 8 = O'Hara-Rudy CiPA v1 2017 (endo)
* OR --cellml <file>
*
* SPECIFYING PACING:
* --pacing-freq            Pacing frequency (Hz) (optional - defaults to 1Hz)
* --pacing-max-time        Maximum time for which to pace the cell model in MINUTES
*                          (optional - defaults to time for 10,000 paces at this frequency)
* --pacing-stim-duration   Duration of the square wave stimulus pulse applied (ms)
*                          (optional - defaults to stimulus duration from CellML)
* --pacing-stim-magnitude  Height of the square wave stimulus pulse applied (uA/cm^2)
*                          (optional - defaults to stimulus magnitude from CellML)
*
* SPECIFYING DRUG PROPERTIES dose-response properties for each channel:
* Channels are named:
* * herg (IKr current - hERG),
* * na (fast sodium current - NaV1.5),
* * nal (late/persistent sodium current - NaV1.5 (perhaps!)),
* * cal (L-type calcium current- CaV1.2),
* * iks (IKs current - KCNQ1 + MinK),
* * ik1 (IK1 current - KCNN4 a.k.a. KCa3.1),
* * ito ([fast] Ito current - Kv4.3 + KChIP2.2).
*
* For each channel you specify dose-response parameters [multiple entries for repeat experiments]
*   EITHER with IC50 values (in uM), for example for 'hERG':
* --ic50-herg     hERG IC50    (optional - defaults to "no effect")
*   OR with pIC50 values (in log M):
* --pic50-herg    hERG pIC50   (optional - defaults to "no effect")
*     (you can use a mixture of these for different channels if you wish, 
*     e.g. --ic50-herg 16600 --pic50-na 5.3 )
*   AND specify Hill coefficients (dimensionless):
* --hill-herg     hERG Hill    (optional - defaults to "1.0")
*   AND specify the saturation effect of the drug on peak conductance (%):
* --saturation-herg   saturation level effect of drug (optional - defaults to 0%)
*
* SPECIFYING CONCENTRATIONS AT COMMAND LINE:
* --plasma-concs  A list of (space separated) plasma concentrations at which to test (uM)
* OR alternatively:
* --plasma-conc-high  Highest plasma concentration to test (uM)
* --plasma-conc-low   Lowest  plasma concentration to test (uM) 
*                     (optional - defaults to 0)
*
* both ways of specifying test concentrations have the following optional arguments
* --plasma-conc-count  Number of intermediate plasma concentrations to test 
*                 (optional - defaults to 0 (for --plasma-concs) or 11 (for --plasma-conc-high))
* --plasma-conc-logscale <True/False> Whether to use log spacing for the plasma concentrations 
*
* SPECIFYING CONCENTRATIONS IN A FILE (for PKPD runs):
* if you want to run at concentrations in a file instead of specifying at command line, you can do:
* --pkpd-file <relative or absolute filepath>
*   To evaluate APD90s throughout a PKPD profile please provide a file with the data format:
*   Time(any units)<tab>Conc_trace_1(uM)<tab>Conc_trace_2(uM)<tab>...Conc_trace_N(uM)
*   on each row.
*
* UNCERTAINTY QUANTIFICATION:
* --credible-intervals [x y z...] This flag must be present to do uncertainty calculations.
*                      It can optionally be followed by a specific list of percentiles that are required
*                      (not including 0 or 100, defaults to just the 95% intervals).
* Then to specify 'spread' parameters for assay variability - for use with Lookup Tables:
* --pic50-spread-herg      (for each channel that you are providing ic50/pic50 values for,
* --hill-spread-herg        herg is just given as an example)
*   (for details of what these spread parameters are see 'sigma' and '1/beta' in Table 1 of:
*    Elkins et al. 2013  Journal of Pharmacological and Toxicological 
*    Methods, 68(1), 112-122. doi: 10.1016/j.vascn.2013.04.007 )
*
* OTHER OPTIONS:
* --no-downsampling  By default, we print downsampled output to create small action potential
*                    traces, but you can switch this off by calling this option.
* --output-dir       By default output goes into '$CHASTE_TEST_OUTPUT/ApPredict_output'
*                    but you can redirect it (useful for parallel scripting)
*                    with this argument.
*
`;

const HELP_LOOKUP_TABLE_MANIFEST = `grandi_pasqualini_bers_2010_1d_hERG_1Hz_generator.arch.tgz
grandi_pasqualini_bers_2010_1d_ICaL_1Hz_generator.arch.tgz
grandi_pasqualini_bers_2010_1d_IK1_1Hz_generator.arch.tgz
grandi_pasqualini_bers_2010_1d_IKs_1Hz_generator.arch.tgz
grandi_pasqualini_bers_2010_1d_INa_1Hz_generator.arch.tgz
grandi_pasqualini_bers_2010_2d_hERG_ICaL_1Hz_generator.arch.tgz
grandi_pasqualini_bers_2010_3d_hERG_IKs_ICaL_1Hz_generator.arch.tgz
grandi_pasqualini_bers_2010_3d_hERG_INa_ICaL_1Hz_generator.arch.tgz
grandi_pasqualini_bers_2010_4d_hERG_IKs_INa_ICaL_1Hz_generator.arch.tgz
HundRudy2004_units_1d_hERG_1Hz_generator.arch.tgz
HundRudy2004_units_3d_hERG_INa_ICaL_1Hz_generator.arch.tgz
MahajanShiferaw2008_units_1d_hERG_1Hz_generator.arch.tgz
MahajanShiferaw2008_units_3d_hERG_INa_ICaL_1Hz_generator.arch.tgz
ohara_rudy_2011_1d_hERG_1Hz_generator.arch.tgz
ohara_rudy_2011_endo_1d_hERG_1Hz_generator.arch.tgz
ohara_rudy_2011_endo_3d_hERG_INa_ICaL_1Hz_generator.arch.tgz
ohara_rudy_cipa_v1_2017_1d_hERG_0.5Hz_generator.arch.tgz
ohara_rudy_cipa_v1_2017_1d_ICaL_0.5Hz_generator.arch.tgz
ohara_rudy_cipa_v1_2017_1d_INa_0.5Hz_generator.arch.tgz
ohara_rudy_cipa_v1_2017_2d_hERG_ICaL_0.5Hz_generator.arch.tgz
ohara_rudy_cipa_v1_2017_3d_hERG_IKs_ICaL_0.5Hz_generator.arch.tgz
ohara_rudy_cipa_v1_2017_3d_hERG_IKs_ICaL_1Hz_generator.arch.tgz
ohara_rudy_cipa_v1_2017_3d_hERG_INa_ICaL_0.5Hz_generator.arch.tgz
ohara_rudy_cipa_v1_2017_4d_hERG_INa_ICaL_INaL_0.5Hz_generator.arch.tgz
paci_hyttinen_aaltosetala_severi_ventricularVersion_1d_hERG_1Hz_generator.arch.tgz
shannon_wang_puglisi_weber_bers_2004_model_updated_1d_hERG_0.5Hz_generator.arch.tgz
shannon_wang_puglisi_weber_bers_2004_model_updated_1d_hERG_1Hz_generator.arch.tgz
shannon_wang_puglisi_weber_bers_2004_model_updated_1d_ICaL_0.5Hz_generator.arch.tgz
shannon_wang_puglisi_weber_bers_2004_model_updated_1d_ICaL_1Hz_generator.arch.tgz
shannon_wang_puglisi_weber_bers_2004_model_updated_1d_IK1_0.5Hz_generator.arch.tgz
shannon_wang_puglisi_weber_bers_2004_model_updated_1d_IK1_1Hz_generator.arch.tgz
shannon_wang_puglisi_weber_bers_2004_model_updated_1d_IKs_0.5Hz_generator.arch.tgz
shannon_wang_puglisi_weber_bers_2004_model_updated_1d_IKs_1Hz_generator.arch.tgz
shannon_wang_puglisi_weber_bers_2004_model_updated_1d_INa_0.5Hz_generator.arch.tgz
shannon_wang_puglisi_weber_bers_2004_model_updated_1d_INa_1Hz_generator.arch.tgz
shannon_wang_puglisi_weber_bers_2004_model_updated_1d_Ito_0.5Hz_generator.arch.tgz
shannon_wang_puglisi_weber_bers_2004_model_updated_1d_Ito_1Hz_generator.arch.tgz
shannon_wang_puglisi_weber_bers_2004_model_updated_3d_hERG_IKs_ICaL_1Hz_generator.arch.tgz
shannon_wang_puglisi_weber_bers_2004_model_updated_3d_hERG_INa_ICaL_1Hz_generator.arch.tgz
shannon_wang_puglisi_weber_bers_2004_model_updated_4d_hERG_IKs_INa_ICaL_0.5Hz_generator.arch.tgz
shannon_wang_puglisi_weber_bers_2004_model_updated_4d_hERG_IKs_INa_ICaL_1Hz_generator.arch.tgz
tentusscher_model_2006_epi_1d_hERG_1Hz_generator.arch.tgz
tentusscher_model_2006_epi_1d_ICaL_1Hz_generator.arch.tgz
tentusscher_model_2006_epi_1d_IK1_1Hz_generator.arch.tgz
tentusscher_model_2006_epi_1d_IKs_1Hz_generator.arch.tgz
tentusscher_model_2006_epi_1d_INa_1Hz_generator.arch.tgz
tentusscher_model_2006_epi_1d_Ito_1Hz_generator.arch.tgz
tentusscher_model_2006_epi_2d_hERG_ICaL_1Hz_generator.arch.tgz
tentusscher_model_2006_epi_2d_hERG_IKs_1Hz_generator.arch.tgz
tentusscher_model_2006_epi_3d_hERG_INa_ICaL_1Hz_generator.arch.tgz
tentusscher_model_2006_epi_4d_hERG_IKs_INa_ICaL_1Hz_generator.arch.tgz
`;

/**************************** Function declarations ***************************/

const APPREDICT_OUTPUT_DIR = 'ApPredict_output';

const CHANNELS = {
  IKr: 'herg',
  INa: 'na',
  ICaL: 'cal',
  IKs: 'iks',
  IK1: 'ik1',
  Ito: 'ito',
  INaL: 'nal'
}

// '38 68 86 95' represents half, 1, 1.5 and 2 standard deviations.
const DEFAULT_CREDIBLE_INTERVAL_PCTILES = '38 68 86 95';
const DEFAULT_HILL = 1;
const DEFAULT_SATURATION = 0;
/**
 * Process pIC50/Hill/Saturation and spread data.
 *
 * @param Channel's associatedItem item.
 * @return Object with arrayed associated data values joined by spaces.
 */
function process_associated_data(associated_item) {
  if (typeof associated_item === 'undefined') {
    return;
  }
  var associated_data = associated_item.associatedData;
  var spreads = associated_item.spreads;

  var data_errors = [];

  if (typeof associated_data !== 'undefined') {

    var pIC50s = [];
    var hills = [];
    var saturations = [];

    associated_data.forEach((associated_item) => {
      var pIC50 = associated_item.pIC50;
      var has_pIC50 = false;
      if (numbers([ pIC50 ])) {
        has_pIC50 = true;
        pIC50s.push(pIC50);
      } else {
        data_errors.push('Invalid pIC50 of ' + pIC50);
      }
      var hill = associated_item.hill;
      if (has_data(hill)) {
        if (numbers([ hill ])) {
          hills.push(hill);
        } else {
          data_errors.push('Invalid Hill of ' + hill);
        }
      } else {
        hills.push(DEFAULT_HILL);
      }
      var saturation = associated_item.saturation;
      if (has_data(saturation)) {
        if (numbers([ saturation ])) {
          saturations.push(saturation);
        } else {
          data_errors.push('Invalid saturation of ' + saturation);
        }
      } else {
        saturations.push(DEFAULT_SATURATION);
      }
    });

    if (typeof spreads !== 'undefined') {
      var c50_spread = spreads.c50Spread;
      if (has_data(c50_spread) && !numbers([ c50_spread ])) {
        data_errors.push('Invalid C50 spread of ' + c50_spread);
      }
      var hill_spread = spreads.hillSpread;
      if (has_data(hill_spread) && !numbers([ hill_spread ])) {
        data_errors.push('Invalid Hill spread of ' + hill_spread);
      }
    }

    if (data_errors.length == 0) {
      return {
        'spreads': spreads,
        'pIC50s': pIC50s.join(' '),
        'hills': hills.join(' '),
        'saturations': saturations.join(' ')
      }
    }
  } else {
    if (typeof spreads !== 'undefined') {
      data_errors.push('Spreads defined where no associated data defined');
    }
  }

  if (data_errors.length > 0) {
    return {
      'dataErrors' : data_errors
    }
  }

  return;
}

/**
 * Helper function to indicate non-empty value.
 *
 * @param obj Item to test.
 * @return {@code true} if non-empty, otherwise {@code false}.
 */
function has_data(obj) {
  return (typeof obj !== 'undefined') && ((obj + '').trim().length > 0);
}

/**
 * Perform an asynchronous invocation of the script which kicks of ApPredict.
 *
 * @param appredict_input JSON representation of ApPredict input.
 * @param config Simulation and file identifiers.
 * @return The object representing the completion (or failure).
 */
function call_invoke(appredict_input, config) {
  var simulation_id = config.id;
  var run_dir = config.dirs.run;
  var res_dir = config.dirs.res;
  var std_file_prefix = config.std_file_prefix;
  var stop_file = config.files.stop;
  var stdout_file = config.files.stdout;
  var stderr_file = config.files.stderr;

  return new Promise((resolve, reject) => {
    var input_verification_errors = [];
    var model_id = '';  //defined below in the checks
    var PK_data_file = ''; //defined below in the checks

    var plasma_args = '';
    var setPlasmaArgs = new Promise(function(resolve, reject) {
      if (typeof appredict_input.plasmaPoints !== 'undefined' && Array.isArray(appredict_input.plasmaPoints)){
        if (!numbers(appredict_input.plasmaPoints)) {
          input_verification_errors.push('Non-numeric in plasma points ' + JSON.stringify(input_plasma_points));
          resolve();
        }else {
          plasma_args = `--plasma-concs ${appredict_input.plasmaPoints.join(' ')} `;
          resolve();
        }
      }else if(typeof appredict_input.PK_data_file !== 'undefined'){
        const uploaded_path = concatenator([DIR_UPLOADED_FILES, `${simulation_id.replaceAll('-', '_')}.tsv`], false);
        fs.writeFile(uploaded_path, appredict_input.PK_data_file, function (err) {
          if (err){
            input_verification_errors.push(err);
            resolve();
          }else{
            PK_data_file = `${uploaded_path}`;
            plasma_args = `--pkpd-file ${PK_data_file} `;
            console.log(`INFO: uploaded PK data file saved: ${PK_data_file}`);
            resolve();
          }
        });
      }else {
        // These required values must be numeric if no plasma points defined.
        var plasma_vals = [ appredict_input.plasmaMaximum, appredict_input.plasmaMinimum, appredict_input.plasmaIntermediatePointCount ];
        // https://stackoverflow.com/questions/18082/validate-decimal-numbers-in-javascript-isnumeric
        if (!plasma_vals.every((element) => {
                return (has_data(element) && !isNaN(parseFloat(element)) && isFinite(element));
              }) ) {
                     input_verification_errors.push('Invalid plasma max/min/points data! : ' + JSON.stringify(plasma_vals));
                     resolve();
                   }
        if (typeof appredict_input.plasmaIntermediatePointLogScale !== 'boolean') {
          input_verification_errors.push('Expected boolean primitive for appredict_input.plasmaIntermediatePointLogScale! : ' + JSON.stringify(appredict_input));
          resolve();
        }
        plasma_args += ` --plasma-conc-high ${appredict_input.plasmaMaximum} --plasma-conc-low ${appredict_input.plasmaMinimum} --plasma-conc-count ${appredict_input.plasmaIntermediatePointCount} --plasma-conc-logscale ${appredict_input.plasmaIntermediatePointLogScale} `;
        resolve();
      }
    });


    var setModelId = new Promise(function(resolve, reject) {
      if (has_data(appredict_input.modelId)) {
          model_id = `${appredict_input.modelId}`;
          resolve();
      }else{
        if(has_data(appredict_input.cellml_file)){
          const uploaded_path = concatenator([DIR_UPLOADED_FILES, `${simulation_id.replaceAll('-', '_')}.cellml`], false);
          fs.writeFile(uploaded_path, appredict_input.cellml_file, function (err) {
            if (err){
              input_verification_errors.push(err);
              resolve();
            }else{
              model_id = `${uploaded_path}`
              console.log(`INFO: uploaded cellml file saved: ${model_id}`);
              resolve();
            }
          });
        }else{
            input_verification_errors.push('A model call (id) or uploaded cellml file must be defined via modelId or cellml_file');
            resolve();
        }
      }
    });

    if (!has_data(appredict_input.pacingFrequency)) {
      input_verification_errors.push('A pacing frequency must be defined via metaData.pacingFrequency');
    }
    // These values must be numeric (if defined).
    if (![appredict_input.pacingFrequency, appredict_input.pacingMaxTime].every((element) => {
            return (!has_data(element) || (has_data(element) && !isNaN(parseFloat(element)) && isFinite(element)));
          }) ) {
      input_verification_errors.push('Non-numeric encountered! : ' + JSON.stringify(appredict_input));
    }
    // --model can now take model name or cellml file

    if(has_data(model_id) && !isNaN(parseFloat(model_id)) && isFinite(model_id)){
      console.log(`INFO : using non-numeric --model ${model_id}`);
    }


    var args = `--pacing-freq ${appredict_input.pacingFrequency} --pacing-max-time ${appredict_input.pacingMaxTime} `;

    var spreads_detected = false;

    Object.keys(CHANNELS).forEach(function(key, index) {
      var channel = key;
      var appredict_name = CHANNELS[key];
      var associated_item = appredict_input[channel];
      if (typeof associated_item !== 'undefined') {
        var channel_data = process_associated_data(associated_item);
        if (typeof channel_data !== 'undefined') {
          if (typeof channel_data.dataErrors !== 'undefined') {
            input_verification_errors = input_verification_errors.concat(channel_data.dataErrors);
          } else if (typeof channel_data.pIC50s !== 'undefined') {
            var pIC50s = channel_data.pIC50s;
            if (has_data(pIC50s)) {
              args += '--pic50-' + appredict_name + ' ' + pIC50s + ' ';
              var hills = channel_data.hills;
              if (has_data(hills)) {
                args += '--hill-' + appredict_name + ' ' + hills + ' ';
              }
              var saturations = channel_data.saturations;
              if (has_data(saturations)) {
                args += '--saturation-' + appredict_name + ' ' + saturations + ' ';
              }

              var spreads = channel_data.spreads;
              if (typeof spreads !== 'undefined') {
                var pIC50_spread = spreads.c50Spread;
                var hill_spread = spreads.hillSpread;
                if (has_data(pIC50_spread)) {
                  spreads_detected = true;
                  args += '--pic50-spread-' + appredict_name + ' ' + pIC50_spread + ' ';
                }
                if (has_data(hill_spread)) {
                  spreads_detected = true;
                  args += '--hill-spread-' + appredict_name + ' ' + hill_spread + ' ';
                }
              }
            } else {
              console.log('No pIC50 data for ' + channel + '. Ignoring!');
            }
          }
        }
      }
    });

    if (spreads_detected) {
      var credible_interval_pctiles;
      if (typeof appredict_input.credibleIntervalPctiles !== 'undefined') {
        if (numbers(appredict_input.credibleIntervalPctiles) && appredict_input.credibleIntervalPctiles.length > 0) {
          credible_interval_pctiles = appredict_input.credibleIntervalPctiles.join(' ');
        } else {
          input_verification_errors.push('Invalid value in credible interval pctiles : ' + JSON.stringify(appredict_input.credibleIntervalPctiles));
        }
      } else {
        console.log('DEBUG : Using default credible interval pctiles values of ' + DEFAULT_CREDIBLE_INTERVAL_PCTILES);
        credible_interval_pctiles = DEFAULT_CREDIBLE_INTERVAL_PCTILES;
      }
      args += '--credible-intervals ' + credible_interval_pctiles;
    }

    Promise.all([setModelId, setPlasmaArgs]).then(function(){
      if (input_verification_errors.length > 0) {
        var messages = input_verification_errors.join('\n');
        write_stderr(std_file_prefix, stderr_file, stop_file, messages);
        return;
      }
      
      args += ` ${plasma_args} --model ${model_id} `;

      console.log('DEBUG : ApPredict args : ' + args);

      exec(RUNME_SCRIPT + ' ' + run_dir
                        + ' ' + res_dir
                        + ' ' + APPREDICT_OUTPUT_DIR
                        + ' ' + args,
                        (error, stdout, stderr) => {
                            
            // cleanup: remove cellml and pk data file if it exists
            fs.access(model_id, (err) => {
              if(!err){
                fs.unlink(model_id, () => console.log(`INFO: deleted ${model_id}`));
              }
            });
            fs.access(PK_data_file, (err) => {
              if(!err){
                fs.unlink(PK_data_file, () => console.log(`INFO: deleted ${PK_data_file}`));
              }
            });

            if (stdout) {
              console.log('DEBUG : ** ' + simulation_id + ' : ApPredict stdout follows *****');
              console.log(stdout);
              console.log('********************************************************************************');
              var to_stdout = '\nHTTP Request : ' + JSON.stringify(appredict_input) + '\n\n' + stdout + '\n';
              fs.appendFile(stdout_file, to_stdout, function (err) {
                if (err != null) {
                  console.log('stdout ' + err);
                }
              });
            }
            if (stderr) {
              // Possible causes:
              //   1. Can't find ApPredict.sh (maybe app-manager not started in container)
              //   2. Simulation crashed during processing.
              //   3. ApPredict invoking wget (which writes download info to stderr!)
              console.log('ERR01 : ** ' + simulation_id + ' : ApPredict stderr follows *****');
              console.log(stderr);
              console.log('********************************************************************************');
              fs.appendFile(stderr_file, stderr, function (err) {
                if (err != null) {
                  console.log('stderr ' + err);
                }
              });
            }
            if (error !== null) {
              console.log('ERR02 : ' + error);
              reject(error);
            }
            resolve(stdout || stderr);
          });
    });
  });
};

/**
 * Helper function to indicate if value is a string.
 *
 * @param obj Object to test.
 * @return {@code true} if a string, otherwise false.
 */
function is_string(obj) {
  // https://stackoverflow.com/questions/4059147/check-if-a-variable-is-a-string-in-javascript
  return (typeof obj === 'string' || obj instanceof String);
}

/**
 * Helper function to indicate if all values in the array are numbers.
 *
 * @param arr Array to process.
 * @return {@code true} if all values were numeric, otherwise {@code false}.
 */
function numbers(arr) {
  if (!arr.every((element) => {
        return (typeof element !== 'undefined' &&
                (is_string(element) ? element.trim() != '' : true) &&
                !isNaN(parseFloat(element)) && isFinite(element));
      })) {
    return;
  }
  return true;
}

/**
 * Build up a directory path with native path separator.
 *
 * @param string_arr String array to concatenate.
 * @param append_separator `true` if to append a native path separator, otherwise `false`.
 * @returns Concatenated string.
 */
function concatenator(string_arr, append_separator) {
  var concatenated = string_arr.join(path.sep);
  if (append_separator) {
    concatenated += path.sep;
  }
  return concatenated;
}

/**
 * Handle a URL response.
 *
 * @param origin Calling function name/identifier.
 * @param url URL responded to.
 * @param error Optional error message received.
 * @param response Response received.
 * @param body Body received.
 */
function handle_data_response(origin, url, error, response, body) {
  if (typeof response !== 'undefined' &&                   /* datastore is offline? */
      typeof response.statusCode !== 'undefined' &&
      response.statusCode == 200) {
    // console.log('DEBUG : Everything ok!!');
  } else {
    if (error) {
      if (typeof error === 'object') {
        var errno = error.errno;
        if (typeof errno !== 'undefined' && errno == 'ECONNREFUSED') {
          // Indicative of data url being inaccessible! May be a transitory problem on startup!
          var error_msg = 'ERR03 : ' + url + ' : Cannot connect to ' + error.address + ':' + error.port;
          console.error(error_msg);
        } else {
          console.error('ERR03 : ' + url + ' : ' + JSON.stringify(error));
        }
      } else {
        console.error('ERR03 : ' + url + ' : ' + error);
      }
      return;
    }
    console.log('WARN2 : Response : ' + JSON.stringify(response));
    console.log('WARN2 : Body : ' + JSON.stringify(body));
  }
}

/**
 * Run ApPredict via an asynchronous function call.
 *
 * @param appredict_input ApPredict json-format input values.
 * @param config Simulation and file config values.
 */
async function run_appredict(appredict_input, config) {
  try {
    await call_invoke(appredict_input, config);
  } catch (error) {
    console.log('ERR09 : ' + error);
  }
}

/**
 * React when convert.sh has written a new directory.
 *
 * @param directory_path Just-created directory path.
 */
function on_add_dir(directory_path) {
  var path_components = directory_path.split(path.sep);
  var last_component = path_components[path_components.length - 1];
  // Look for a UUID as the last component in the directory name.
  if (/^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i.test(last_component)) {
    var uuid = last_component;

    // Create a new record in the data store for this simulation id.
    var url = rest_api_url_data + REST_API_URL_COLLECTIONS;
    tiny.post({
      url: url,
      data: { 'uuid': uuid },
    }, 
    function _res(err, res) {
        handle_data_response('on_add_dir', url, err, res, res.body);
    });
  }
}


/**
 * React when convert.sh has written a new file.
 *
 * Added files are usually created empty so generally not of much concern to
 * the application - it's usually the "change" event signifying data being
 * written to the file which is useful.

 * @param file_path Just-created file.
 */
function on_file_add(file_path) {
  var path_components = file_path.split(path.sep);
  var third_last_component = path_components[path_components.length - 3];
  // Look for a UUID as the third-to-last component in the file path
  if (/^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i.test(third_last_component)) {
    var uuid = third_last_component;

    /* We're actually only interested in the appearance of the file which
       indicates that ApPredict has stopped running. */
    var file_name = path.basename(file_path);
    var url = rest_api_url_data + REST_API_URL_COLLECTION;
    if (/^STOP$/i.test(file_name)) {
      tiny.post({
        url: url,
        data: {'uuid': uuid, 'stop': 'STOP'},
      },
      function _res(err, res) {
        handle_data_response('on_file_add', url, err, res, res.body);
      });

    } else if (/^STD(ERR|OUT)$/i.test(file_name)) {
      //
    }
  }
}

/**
 * React when convert.sh has changed a file.
 *
 * This usually means when data actually appears in the file, rather than when
 * the (initially empty) file is added. This difference may be important if
 * directly creating files in run_me.sh.
 *
 * @param file_path Just-changed file.
 */
function on_file_change(file_path) {
  var path_components = file_path.split(path.sep);
  var third_last_component = path_components[path_components.length - 3];
  // Look for a UUID as the third-to-last component in the file path
  if (/^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i.test(third_last_component)) {
    var uuid = third_last_component;

    var file_name = path.basename(file_path);
    var send_data = true;
    // Does it have the json file extension?
    if (/\.json$/i.test(file_name)) {
      var file_name_no_ext = path.basename(file_path, '.json');

      if (/^progress_status$/i.test(file_name_no_ext)) {
      } else if (/^voltage_results$/i.test(file_name_no_ext)) {
      } else if (/^conc_.*_voltage_trace$/i.test(file_name_no_ext)) {
      } else if (/^voltage_traces$/i.test(file_name_no_ext)) {
      } else if (/^q_net$/i.test(file_name_no_ext)) {
      } else if (/^messages$/i.test(file_name_no_ext)) {
      } else {
        send_data = false;
        console.log('WARN3 : Unrecognised .json file title of ' + file_name_no_ext + ' for id ' + uuid + '!');
      }

      if (send_data) {
        fs.readFile(file_path, { encoding: 'utf-8' }, (error, contents) => {
          if (error) {
            console.log('ERR04 : File read : ' + file_path + ' ' + error);
          } else {
            let parsed;
            let send_it = true;
            try {
              parsed = JSON.parse(contents);
            } catch (e) {
              // Can occur quite frequently
              let show_contents = contents.length > 100 ?
                                  contents.substring(0, 99) + '.... <-- truncated!' :
                                  contents;
              console.log('INFO1 : ' + file_path + ' ignore invalid JSON ...' + show_contents);
              send_it = false;
            }

            if (send_it) {
              var url = rest_api_url_data + REST_API_URL_COLLECTION;
              tiny.post({
                url: url,
                data:{
                  'uuid': uuid,
                  'filetitle': file_name_no_ext,
                  'contents': parsed
                },
              },
              function _res(err, res) {
                handle_data_response('on_file_change', url, err, res, res.body);
              });

            }
          }
        });
      }
    } else {
      if (!/^STD(ERR|OUT)$/i.test(file_name)) {
        send_data = false;
      }

      if (send_data) {
        fs.readFile(file_path, { encoding: 'utf-8' }, (error, contents) => {
          if (error) {
            console.log('ERR10 : File read : ' + file_path + ' ' + error);
          } else {
            var url = rest_api_url_data + REST_API_URL_COLLECTION;
            console.log('Posting to ' + url + ': ' + contents);
            tiny.post({
              url: url,
              data: {
                'uuid': uuid,
                'filetitle': file_name,
                'contents': contents
              },
            },
            function _res(err, res) {
              handle_data_response('on_file_change', url, err, res, res.body);
            });

          }
        });
      }
    }
  }
}

/**
 * Watch files not in "ApPredict_output/" in the "run" directory (convert.sh does
 * that!), but instead files and directories in the "results" directory which
 * convert.sh creates and writes out to in json format.
 *
 * This watcher behaves as a "push" mechanism when the application deployment
 * includes the optional intermediary REST API data store between client-direct
 * and app-manager.
 */
function watch_results_files() {
  console.log('DEBUG : Watching ' + DIR_APPREDICT_RESULTS);
  var watcher = chokidar.watch(DIR_APPREDICT_RESULTS, {
    ignored: /(^|[\/\\])\../,
    persistent: true
  });

  watcher.on('add', path => on_file_add(path))
         .on('change', path => on_file_change(path))
         .on('addDir', path => on_add_dir(path))
         .on('error', error => console.log('ERR05 : Watcher : ' + error ))
}

/**
 * Write to the stderr file.
 *
 * @param std_file_prefix Parent directory of stderr file.
 * @param stderr_file File location of STDERR file.
 * @param stop_file File location of STOP file.
 * @param messages Messages to write to the STDERR file.
 */
function write_stderr(std_file_prefix, stderr_file, stop_file, messages) {
  console.log('');
  console.log('****');
  console.log('ERR13 : ' +  messages);
  console.log('****');
  console.log('');

  fs.mkdirSync(std_file_prefix, { recursive: true });
  fs.writeFile(stderr_file, messages, function(err_stderr) {
    if (err_stderr) {
      console.log(err_stderr);
    } else {
      fs.writeFile(stop_file, '', function(err_stop) {
        if (err_stop) {
          console.log(err_stop);
        }
      });
    }
  });
}

/******************************************************************************/

if (typeof process.env.REST_API_URL_DATA !== 'undefined' && process.env.REST_API_URL_DATA != '') {
  rest_api_url_data = process.env.REST_API_URL_DATA;
  if (rest_api_url_data[rest_api_url_data.length - 1] != '/') {
    rest_api_url_data = rest_api_url_data + '/';
    console.log('INFO2 : REST_API_URL_DATA adjusted to append trailing forward-slash.');
  }
  console.log('INFO2 : REST_API_URL_DATA defined in ENV vars. Using: ' + rest_api_url_data);
  // "pushing" of data to a REST API data repository requires the URL be assigned.
  setTimeout(watch_results_files, 1000);
} else {
  console.log('INFO2 : REST_API_URL_DATA not defined in ENV vars. Assuming client-direct querying directly.');
}

function send_resp(response, return_obj) {
  response.end(JSON.stringify(return_obj));
}

const server = http.createServer((request, response) => {
  // Object to return to caller.
  var return_obj = {};

  var pathname_data = url.parse(request.url, true).pathname;
  var components = pathname_data.split(path.sep);

  if (request.method == 'POST') {
    var simulation_id = uuidv4();

    var run_dir = concatenator( [ DIR_APPREDICT_RUN, simulation_id], false);
    var res_dir = concatenator( [ DIR_APPREDICT_RESULTS, simulation_id], false);
    var std_file_prefix = concatenator( [ res_dir, APPREDICT_OUTPUT_DIR ], false);
    var stop_file = concatenator( [ std_file_prefix, 'STOP' ], false);
    var stdout_file = concatenator( [ std_file_prefix, 'STDOUT' ], false);
    var stderr_file = concatenator( [ std_file_prefix, 'STDERR' ], false);

    var config = {
      'id' : simulation_id,
      'dirs' : {
          'run' : run_dir,
          'res' : res_dir
      },
      'std_file_prefix' : std_file_prefix,
      'files' : {
           'stop' : stop_file,
           'stdout' : stdout_file,
           'stderr' : stderr_file
      }
    }

    console.log('DEBUG : Request path : ' + pathname_data);
    var keep_alive = components.includes('keep_alive');

    let body = [];
    request.on('data', (data) => {
      body.push(data);
      console.log('DEBUG : on data : ' + Buffer.concat(body).toString());
      /*
       * If there's more than 1024 bytes arriving via a curl command then see
       * https://stackoverflow.com/questions/463144/php-http-post-fails-when-curl-data-1024
       * which illustrates the necessity to add the "Expect:" header, e.g.
       * `curl --header "Expect: " --header "Content-Type:application/json" -X POST -d @request.json http://192.168.0.20:8080/`
       */
     }).on('end', () => {
      /* https://nodejs.org/es/docs/guides/anatomy-of-an-http-transaction/ */
      body = Buffer.concat(body).toString();

      /* Example data: {"created":1550659422962,"modelId":8,"pacingFrequency":1,"pacingMaxTime":5,.... */
      try {
        var parsed = JSON.parse(body);
        console.log('DEBUG : on end : ' + JSON.stringify(parsed));
      } catch (error) {
        var error_msg = 'Could not parse POSTed body!: ' + body;
        console.log('ERR06 : ' + error_msg);
        write_stderr(std_file_prefix, stderr_file, stop_file, error_msg);
      }

      if (typeof parsed !== 'undefined') {
        run_appredict(parsed, config);
      }

      console.log('DEBUG : Request body : ' + body);
    });

    /*
     * Going to ask for client to close connection after container has kicked
     * off a simulation.
     * If the client is a browser it's more than likely Connection will be
     * 'keep-alive' which if there's app-manager replication, it will cause all
     * simulation requests to end up hitting the same container (until the
     * keep-alive timeout is reached, e.g. 115 seconds on FF I think - see
     * about:config).
     * Some clients may be restricted in the capacity to send all data in a
     * single POST request, and as such require additional 'data' calls to the
     * REST API, in which case the "Connection: close" needs to be removed.
     */
    var response_headers = {
      'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, cache-control, pragma, expires, connection',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json' };

    if (!keep_alive) {
      console.log('DEBUG : Adding \'Connection: close\' to response headers');
      response_headers.Connection = 'close';
    }
    response.writeHead(200, response_headers);

    /*
     * Simply receiving a simulation request is considered a "success"!
     * Even if run_appredict wasn't even called (i.e. no request data event
     *   triggered -- see above) it'll return "success"!
     * TODO: Improve feedback of problems to calling client mechanism!
     */
    return_obj = {
      'success': {
        'id': simulation_id,
        'ip': ip.address()
      }
    };

    // Sending a string while header saying "it's json" is ok!
    response.end(JSON.stringify(return_obj));
    //setTimeout(function () { send_resp(response, return_obj) }, 2000);
  } else if (request.method == 'GET') {
    /* Example URL: http://127.0.0.1:8080/api/collection/63fba96a-5b2e-4744-8be9-816fbffeebb8/voltage_traces
       The "api/collection/" is used so that client-direct has consistency in
       URL structure between direct app-manager <=> client-direct results/
       progress querying, and similarly via an intermediary REST API data store. */
    if (components.length > 4) {
      // Note: pathname_data should have started with a '/'!
      var simulation_id = components[3];
      var operation = components[4];
    }

    if (typeof simulation_id !== 'undefined') {

      var results_pfx = concatenator([ DIR_APPREDICT_RESULTS, simulation_id, 'ApPredict_output' ],
                                     true);

      if (typeof operation !== 'undefined') {
        switch (operation) {
          case 'STDERR':
          case 'STDOUT':
          case 'STOP':
            var file = results_pfx += operation;
            try {
              var content = fs.readFileSync(file);
              // TODO: String appended otherwise seems to be treated as an object - why!?
              content += '';
              return_obj = {
                'success': true,
                'content': content
              };
            } catch (error) {
              // Ignore "file doesn't exist!" errors (as file only appears when ApPredict stops!)
              if (!error.message.startsWith('ENOENT:')) {
                return_obj = {
                  'error': 'Problem reading ' + file + ' (Caused by: ' + error.message + ')'
                }
              }
            }
            break;
          case 'voltage_results':
          case 'voltage_traces':
          case 'progress_status':
          case 'q_net':
          case 'pkpd_results':
          case 'messages':
            var json_file_path = results_pfx += operation + '.json';
            try {
              // Try parsing first to make sure that it's valid JSON.
              return_obj = {
                'success': JSON.parse(fs.readFileSync(json_file_path))
              };
            } catch (error) {
              // Ignore "file doesn't exist!" errors (as such files take time to appear!)
              if (!error.message.startsWith('ENOENT:')) {
                return_obj = {
                  'error': 'Problem reading ' + json_file_path + ' (Caused by: ' + error.message + ')'
                }
              }
            }
            break;
          case 'received':
            // done reading results, clean up run and results folders
            fs.rm(concatenator([DIR_APPREDICT_RUN, simulation_id], false), {recursive: true}, () => {
              console.log(`INFO: results received, deleted run files for ${simulation_id}`);
              // wait before deleting the results folder, since deleting the run folder triggers the watches to add a STOP file to the results folder
              setTimeout(()=>fs.rm(concatenator([DIR_APPREDICT_RESULTS, simulation_id], false), {recursive: true}, () => console.log(`INFO: results received, deleted results for ${simulation_id}`)), 5000);
            });
            // we don't wait for the deleting to be finished, we want the client to continue
            return_obj = {'success': true};
            break;
          default:
            return_obj = {
              'error': 'Valid data query options are: "STOP", "voltage_traces", "voltage_results", "progress_status", "q_net", "pkpd_results", "messages" and "received"'
            }
            break;
        }
      } else {
        return_obj = {
          'error': 'No data query option (e.g. "voltage_traces", "progress_status", "received") found in ' + pathname_data
        }
      }
    } else {
      if (components.length > 2 && 'help' == components[1].toLowerCase()) {
        // It's a request for help!
        var seeking = components[2];                                 // Only consider first child
        var check_for = seeking.toLowerCase();

        var help_on = '';
        if ('appredict' == check_for) {
          help_on = HELP_APPREDICT;
        } else if ('appredict_lookup_table_manifest.txt' == check_for) {
          help_on = HELP_LOOKUP_TABLE_MANIFEST;
        }
        if (help_on != '') {
          return_obj = {
            'success': help_on
          }
        } else {
          return_obj = {
            'error': 'No help available for: ' + seeking
          }
        }
      } else {
        return_obj = {
          'error': 'No simulation id found in ' + pathname_data
        }
      }
    }

    if (typeof return_obj.error !== 'undefined') {
      console.log('ERR07 : ' + return_obj.error);
    }

    response.writeHead(200, {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept',
      'Content-Type': 'text/plain; charset=utf-8'
    });
    // We're returning text!
    response.end(JSON.stringify(return_obj));
//    response.setTimeout(5);
  } else if (request.method == 'OPTIONS') {
    /*
     * In the CORS world there are certain client request combos (e.g. a POST with some data)
     * which spark a 'preflight' request - This is to handle such.
     * {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS}
     */
    response.writeHead(200, {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, cache-control, pragma, expires, connection',
      'Content-Type': 'text/plain; charset=utf-8'
    });
    response.end('');
  } else {
    response.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, cache-control, pragma, expires, connection',
      'Content-Type': 'text/plain; charset=utf-8'
    });
    var error_msg = 'app-manager accepts GET/POST/OPTIONS only!';
    console.log('ERR08 : ' + error_msg);
    return_obj = {
      'error': error_msg
    }
    response.end(JSON.stringify(return_obj));
  }
});

const default_port = 8080;
var port_in_env = (typeof process.env.REST_API_PORT !== 'undefined' && process.env.REST_API_PORT != '');
if (!port_in_env) {
  console.log('INFO4 : REST_API_PORT not defined in ENV vars. Using default value of ' + default_port + '.');
} else {
  var specified_port = new Array(process.env.REST_API_PORT);
  if (!numbers(specified_port)) {
    console.log('ERR11 : Illegal environment port value of ' + specified_port + ' specified - reverting to default value of ' + default_port + '.');
    port_in_env = false;
  }
}
const port = port_in_env ? process.env.REST_API_PORT : default_port;

const host = '0.0.0.0';
server.listen(port, host);
console.log('INFO3 : app-manager listening at http://' + host + ':' + port);
