// How much of the difference between an image and its reduction, in noise deviations, to remove:
// none at a share of 0 and all of it at 1. Between, a component loses nearly all of a difference
// whose neighborhood varies by less than a limit, mostly noise, and of one that varies more, mostly
// detail, about the limit's worth; the limit grows with the share, through its value at one half,
// and without bound toward 1. Weighing neighborhoods rather than single values keeps noise from
// standing out where it varies most.

// Each component's share, and its limit at a share of one half.
export struct Limits {
  shares: vec4f,
  halves: vec4f,
}

// `energy` is the difference's mean square around it.
export fn removed(difference: vec4f, energy: vec4f, limits: Limits) -> vec4f {
  let limit = limits.halves * limits.shares;
  let kept = 1.0 - limits.shares;
  let part = difference * limit * inverseSqrt(limit * limit + kept * kept * energy);
  return select(vec4f(0.0), part, limits.shares > vec4f(0.0));
}
