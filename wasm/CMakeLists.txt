# emcmake cmake -S . -B build-wasm -DCMAKE_BUILD_TYPE=Release && cmake --build build-wasm
# -> web/src/wasm/gv.js + gv.wasm (module ES6, monothread : pas besoin de COOP/COEP pour le DSP)
add_executable(gv_wasm bindings.cpp)
target_link_libraries(gv_wasm PRIVATE gv_offline embind)
set_target_properties(gv_wasm PROPERTIES
  OUTPUT_NAME gv
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/web/src/wasm")
target_compile_options(gv_wasm PRIVATE -O3)
target_link_options(gv_wasm PRIVATE
  -O3
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createGv
  -sENVIRONMENT=web,worker,node
  -sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=2GB
  -sFILESYSTEM=0)
