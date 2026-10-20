cmake_minimum_required(VERSION 3.24)
project(gragarda-voice-web LANGUAGES C CXX)

# Coeur DSP (submodule gragarda-voice-core), sans DeepFilterNet : le web n'utilise que RNNoise.
set(GV_WITH_DFN OFF CACHE BOOL "" FORCE)
add_subdirectory(core)

if(NOT EMSCRIPTEN)
  add_executable(gv-cli tools/gv-cli/main.cpp)
  target_link_libraries(gv-cli PRIVATE gv_offline)
else()
  add_subdirectory(wasm)
endif()
