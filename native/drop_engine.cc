#include <napi.h>

namespace {

Napi::Value PickWeightedIndex(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2 || !info[0].IsArray() || !info[1].IsNumber()) {
    Napi::TypeError::New(env, "Expected arguments: weights:number[], randomValue:number")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  Napi::Array weightsArray = info[0].As<Napi::Array>();
  double randomValue = info[1].As<Napi::Number>().DoubleValue();

  const uint32_t length = weightsArray.Length();
  if (length == 0) {
    return Napi::Number::New(env, -1);
  }

  double totalWeight = 0.0;
  for (uint32_t i = 0; i < length; i++) {
    Napi::Value value = weightsArray.Get(i);
    double weight = value.IsNumber() ? value.As<Napi::Number>().DoubleValue() : 0.0;
    if (weight > 0.0) {
      totalWeight += weight;
    }
  }

  if (totalWeight <= 0.0) {
    return Napi::Number::New(env, -1);
  }

  if (randomValue < 0.0) {
    randomValue = 0.0;
  }
  if (randomValue > totalWeight) {
    randomValue = totalWeight;
  }

  double currentWeight = 0.0;
  for (uint32_t i = 0; i < length; i++) {
    Napi::Value value = weightsArray.Get(i);
    double weight = value.IsNumber() ? value.As<Napi::Number>().DoubleValue() : 0.0;
    if (weight <= 0.0) {
      continue;
    }

    currentWeight += weight;
    if (randomValue <= currentWeight) {
      return Napi::Number::New(env, static_cast<double>(i));
    }
  }

  return Napi::Number::New(env, static_cast<double>(length - 1));
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("pickWeightedIndex", Napi::Function::New(env, PickWeightedIndex));
  return exports;
}

}  // namespace

NODE_API_MODULE(drop_engine, Init)
