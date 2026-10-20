// gv-cli : developper et valider tout le DSP sur PC, sans navigateur.
// gv-cli in.wav out.wav --preset core/presets/voix-chaude.json [--cuts cuts.json] [--report report.json]
// cuts.json = tableau de secondes, ex. [1.25, 3.5]. Sortie : WAV float 32 + rapport JSON (stdout si pas --report).
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <sstream>
#include "gv/Pipeline.h"
#include "gv/Wav.h"

static std::string readFile(const char* p)
{
    std::ifstream f(p, std::ios::binary);
    std::stringstream s;
    s << f.rdbuf();
    return s.str();
}

static std::vector<double> parseCuts(const std::string& j)
{
    std::vector<double> v;
    const char* s = j.c_str();
    while (*s) {
        if ((*s >= '0' && *s <= '9') || *s == '.' || *s == '-') {
            char* e;
            v.push_back(std::strtod(s, &e));
            s = e;
        } else {
            ++s;
        }
    }
    return v;
}

int main(int argc, char** argv)
{
    if (argc < 3) {
        std::fprintf(stderr, "usage: gv-cli in.wav out.wav --preset p.json [--cuts cuts.json] [--report r.json]\n");
        return 2;
    }
    std::string preset = "{}", reportPath;
    std::vector<double> cuts;
    for (int i = 3; i + 1 < argc; i += 2) {
        if (!std::strcmp(argv[i], "--preset")) preset = readFile(argv[i + 1]);
        else if (!std::strcmp(argv[i], "--cuts")) cuts = parseCuts(readFile(argv[i + 1]));
        else if (!std::strcmp(argv[i], "--report")) reportPath = argv[i + 1];
    }
    if (preset.empty()) {
        std::fprintf(stderr, "preset illisible\n");
        return 1;
    }
    gv::AudioBuffer b;
    if (!gv::readWav(argv[1], b)) {
        std::fprintf(stderr, "lecture impossible : %s\n", argv[1]);
        return 1;
    }
    const gv::Report r = gv::runPipeline(b, cuts, preset, [](const char* s, void*) { std::fprintf(stderr, "- %s\n", s); });
    if (!gv::writeWav(argv[2], b)) {
        std::fprintf(stderr, "ecriture impossible : %s\n", argv[2]);
        return 1;
    }
    const std::string json = r.toJson();
    if (reportPath.empty()) std::printf("%s\n", json.c_str());
    else std::ofstream(reportPath) << json;
    return 0;
}
