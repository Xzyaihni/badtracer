#version 300 es

precision mediump float;

// the fact that shaders have no exceptions or any way to debug them
// is INSANE, who designs garbage like this? why r we ok with this?
// but muh performance!!! consider this: debug and release profiles :ooooo

out vec4 frag_color;

const ivec2 CANVAS_DIMENSIONS = ivec2(640, 640);

const int SPHERES_AMOUNT = 10; //COPY TO JS

const int BOUNCE_COUNT = 15;

uniform vec3 spheres_pos[SPHERES_AMOUNT];
uniform float spheres_size[SPHERES_AMOUNT];
uniform vec3 spheres_color[SPHERES_AMOUNT];
uniform float spheres_luminance[SPHERES_AMOUNT];
uniform float spheres_smoothness[SPHERES_AMOUNT];

uniform vec3 camera_pos;
uniform vec3 camera_forward_n;
uniform vec3 camera_right_n;
uniform vec3 camera_up_n;

uniform uint frame_seed[5];

const vec3 topmax_background_color = vec3(0.8, 0.8, 1.0);
const vec3 topmin_background_color = vec3(0.6, 0.6, 0.8);

const float camera_fov = 0.3;
const float camera_focus = 0.15;

const float background_luminance = 0.15;

const float PI = 3.1415926535897932384626433832795;


const float MEAN = 0.0;
const float SD = 1.0;

uint random_u32(uint x)
{
    x ^= x >> 16;
    x *= 0x21f0aaadu;
    x ^= x >> 15;
    x *= 0x735a2d97u;
    x ^= x >> 15;

    return x;
}

struct XorwowState
{
    uint s[5];
    uint i;
};

// xorwow by marsaglia
uint xorwow(inout XorwowState state)
{
    uint t = state.s[4];

    uint previous = state.s[0];
    state.s[4] = state.s[3];
    state.s[3] = state.s[2];
    state.s[2] = state.s[1];
    state.s[1] = previous;

    t ^= t >> 2;
    t ^= t << 1;
    t ^= previous ^ (previous << 4);

    state.s[0] = t;

    state.i += 362437u;

    return t + state.i;
}

/*uint random_u32_seeded(inout uint x)
{
    x = x * 747796405u + 2891336453u;
    x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;

    return x;
}*/

/*uint pair_hash(uint a, uint b)
{
    uint prime = 110947u;
    return (prime + a) * prime + b;
}*/

/*uint pair_hash(uint a, uint b)
{
    uint x = frame_seed[0];
    uint y = frame_seed[1];
    uint z = frame_seed[2];

    return (x * a) + ((y * a) >> 32) + (y * b) + ((z * b) >> 32);
}*/

float uniform_random(inout XorwowState state)
{
    return float(xorwow(state)) / float(~0u);
}

float gauss_random(inout XorwowState state)
{
    float theta = 2.0 * PI * uniform_random(state);
    float dist = sqrt(-2.0 * log(1.0 - uniform_random(state)));

    return MEAN + dist * cos(theta);
}

vec3 direction_random(inout XorwowState state)
{
    return normalize(vec3(gauss_random(state), gauss_random(state), gauss_random(state)));
}

vec3 background_color(vec3 dir)
{
    float a = 1.0 + dir.y * 8.0;

    return mix(topmin_background_color, topmax_background_color, a);
}

struct RayInfo
{
    bool intersected;
    vec3 color;
    vec3 point;
    vec3 normal;
    float luminance;
    float smoothness;
};

RayInfo raycast(vec3 pos, vec3 dir)
{
    RayInfo ray;
    ray.intersected = false;

    float closest_sphere;
    for(int i = 0; i < SPHERES_AMOUNT; ++i)
    {
        vec3 sphere_pos = spheres_pos[i];
        float sphere_radius = spheres_size[i];

        vec3 sphere_offset = pos - sphere_pos;

	float left_sqrt = dot(dir, sphere_offset);
	float left = left_sqrt * left_sqrt;

	float right = dot(sphere_offset, sphere_offset) - (sphere_radius * sphere_radius);

	float nabla = left - right;

        bool sphere_intersected = nabla >= 0.0;

        if (sphere_intersected)
        {
	    float nabla_sqrt = sqrt(nabla);
	    float d = -dot(dir, sphere_offset);

	    float first = d + nabla_sqrt;
	    float second = d - nabla_sqrt;

            float hit_distance = min(first, second);

            bool closer = !ray.intersected || (hit_distance < closest_sphere);
            bool visible = (hit_distance >= 0.0) && closer;

            if (visible)
            {
                closest_sphere = hit_distance;

                vec3 hit_point = pos + dir * hit_distance;

                vec3 hit_normal = normalize(hit_point - sphere_pos);

                ray.intersected = true;
                ray.point = hit_point;
                ray.normal = hit_normal;
                ray.color = spheres_color[i];
                ray.luminance = spheres_luminance[i];
                ray.smoothness = spheres_smoothness[i];
            }
        }
    }

    return ray;
}

vec3 trace(vec3 pos, vec3 dir, inout XorwowState state)
{
    vec3 illuminated_color = vec3(0.0);
    vec3 total_color = vec3(1.0);

    for(int i = 0; i < BOUNCE_COUNT; ++i)
    {
        RayInfo ray = raycast(pos, dir);

        if (ray.intersected)
        {
            total_color *= ray.color;
            illuminated_color += ray.luminance * total_color;

            pos = ray.point;

            vec3 diffuse_dir = normalize(ray.normal + direction_random(state));
            vec3 specular_dir = reflect(dir, ray.normal);

            dir = mix(diffuse_dir, specular_dir, ray.smoothness);
        } else
        {
            total_color *= background_color(dir);
            illuminated_color += background_luminance * total_color;
            break;
        }
    }

    return illuminated_color;
}

vec3 pixel_at(vec2 pixel, inout XorwowState state)
{
    vec3 origin = camera_pos;

    vec2 center_offset = pixel - 0.5;

    vec3 target = center_offset.x * camera_right_n * camera_fov
      + center_offset.y * camera_up_n * camera_fov
      + camera_forward_n * camera_focus;

    vec3 direction = normalize(target);

    return trace(origin, direction, state);
}

void main()
{
    vec2 pixel = gl_FragCoord.xy / vec2(CANVAS_DIMENSIONS);

    uint a = uint(gl_FragCoord.x);
    uint b = uint(gl_FragCoord.y);
    uint index = a + b * uint(CANVAS_DIMENSIONS.x);

    XorwowState state;
    state.s = frame_seed;
    state.s[4] = random_u32(index);
    state.i = frame_seed[4];

    xorwow(state);

    const uint RAYS_PER_PIXEL = 32u;

    vec3 color = vec3(0.0);
    for(uint i = 0u; i < RAYS_PER_PIXEL; ++i)
    {
        color += pixel_at(pixel, state);
    }

    frag_color = vec4(color / float(RAYS_PER_PIXEL), 1.0);
}
