// Bindings Emscripten du pipeline hors temps reel.
// JS : const { report, channels } = Module.run([Float32Array...], 48000, [cuts s], presetJson, stage => {})
#include <emscripten/bind.h>
#include <emscripten/val.h>
#include "gv/Pipeline.h"

using emscripten::val;

static val run(val channels, int sampleRate, val cuts, std::string preset, val onProgress)
{
    gv::AudioBuffer b;
    b.sampleRate = sampleRate;
    const unsigned nc = channels["length"].as<unsigned>();
    for (unsigned c = 0; c < nc; ++c)
        b.ch.push_back(emscripten::convertJSArrayToNumberVector<float>(channels[c]));
    const auto cutList = emscripten::convertJSArrayToNumberVector<double>(cuts);

    const gv::Report r = gv::runPipeline(b, cutList, preset, [](const char* s, void* u) {
        val& cb = *static_cast<val*>(u);
        if (cb.typeOf().as<std::string>() == "function") cb(std::string(s));
    }, &onProgress);

    val out = val::object();
    out.set("report", r.toJson());
    val arr = val::array();
    for (auto& c : b.ch) // copie hors du tas WASM : le tableau JS survit a la liberation du vecteur
        arr.call<void>("push", val::global("Float32Array").new_(emscripten::typed_memory_view(c.size(), c.data())));
    out.set("channels", arr);
    return out;
}

EMSCRIPTEN_BINDINGS(gv)
{
    emscripten::function("run", &run);
}
