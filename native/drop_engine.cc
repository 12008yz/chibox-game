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

Napi::Value ComputeBonusAdjustedWeights(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 3 || !info[0].IsArray() || !info[1].IsArray() || !info[2].IsNumber()) {
    Napi::TypeError::New(env, "Expected arguments: prices:number[], baseWeights:number[], totalBonus:number")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  Napi::Array pricesArray = info[0].As<Napi::Array>();
  Napi::Array baseWeightsArray = info[1].As<Napi::Array>();
  double totalBonus = info[2].As<Napi::Number>().DoubleValue();

  const uint32_t length = pricesArray.Length();
  if (baseWeightsArray.Length() != length) {
    Napi::TypeError::New(env, "prices and baseWeights must have same length")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  Napi::Array modifiedWeights = Napi::Array::New(env, length);
  Napi::Array multipliers = Napi::Array::New(env, length);

  for (uint32_t i = 0; i < length; i++) {
    Napi::Value priceValue = pricesArray.Get(i);
    Napi::Value baseWeightValue = baseWeightsArray.Get(i);

    double itemPrice = priceValue.IsNumber() ? priceValue.As<Napi::Number>().DoubleValue() : 0.0;
    double baseWeight = baseWeightValue.IsNumber() ? baseWeightValue.As<Napi::Number>().DoubleValue() : 0.0;

    double weightMultiplier = 1.0;
    if (totalBonus > 0.0) {
      double priceCategory = (itemPrice - 100.0) / 100.0;
      if (priceCategory < 0.0) {
        priceCategory = 0.0;
      }
      if (priceCategory > 50.0) {
        priceCategory = 50.0;
      }
      weightMultiplier = 1.0 + (totalBonus * (1.0 + priceCategory / 50.0));
    }

    double modifiedWeight = baseWeight * weightMultiplier;
    modifiedWeights.Set(i, Napi::Number::New(env, modifiedWeight));
    multipliers.Set(i, Napi::Number::New(env, weightMultiplier));
  }

  Napi::Object result = Napi::Object::New(env);
  result.Set("modifiedWeights", modifiedWeights);
  result.Set("multipliers", multipliers);
  return result;
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("pickWeightedIndex", Napi::Function::New(env, PickWeightedIndex));
  exports.Set("computeBonusAdjustedWeights", Napi::Function::New(env, ComputeBonusAdjustedWeights));
  return exports;
}

}  // namespace

NODE_API_MODULE(drop_engine, Init)
