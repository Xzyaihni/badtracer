#version 300 es

precision mediump float;

out vec4 frag_color;

const ivec2 CANVAS_DIMENSIONS = ivec2(640, 640);

const int SPHERES_AMOUNT = 10; //COPY TO JS

const int BOUNCE_COUNT = 15;

uniform vec3 spheres_pos[SPHERES_AMOUNT];
uniform float spheres_size[SPHERES_AMOUNT];
uniform vec3 spheres_color[SPHERES_AMOUNT];
uniform float spheres_luminance[SPHERES_AMOUNT];
uniform float spheres_smoothness[SPHERES_AMOUNT];

uniform uint frame_seed;

const vec3 topmax_background_color = vec3(0.8, 0.8, 1.0);
const vec3 topmin_background_color = vec3(0.6, 0.6, 0.8);

const vec3 camera_pos = vec3(0.0, 0.5, -0.4);
const vec3 camera_target = vec3(0.0, 0.0, -1.0);

const vec3 camera_up = vec3(0.0, 1.0, 0.0);

const vec3 camera_forward = camera_pos - camera_target;
const vec3 camera_right = cross(camera_up, camera_forward);

const vec3 camera_forward_n = normalize(camera_forward);
const vec3 camera_right_n = normalize(camera_right);
const vec3 camera_up_n = cross(camera_forward_n, camera_right_n);

const float camera_fov = 1.5;
const float camera_blur = 0.015;
const float camera_focus = 0.15;

const float background_luminance = 0.15;

const float PI = 3.1415926535897932384626433832795;


const float MEAN = 0.0;
const float SD = 1.0;

float uniform_random(inout uint seed)
{
    seed = seed * 747796405u + 2891336453u;
    seed = ((seed >> ((seed >> 28u) + 4u)) ^ seed) * 277803737u;

    return float(seed) / 4294967295.0;
}

float gauss_random(inout uint seed)
{
    float theta = 2.0 * PI * uniform_random(seed);
    float dist = sqrt(-2.0 * log(1.0 - uniform_random(seed)));

    return MEAN + dist * cos(theta);
}

vec3 direction_random(inout uint seed)
{
    return normalize(vec3(gauss_random(seed), gauss_random(seed), gauss_random(seed)));
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

        float a = dot(dir, dir);
        float b = 2.0 * dot(sphere_offset, dir);
        float c = dot(sphere_offset, sphere_offset) - sphere_radius * sphere_radius;

        float d = b * b - 4.0 * a * c;

        bool sphere_intersected = d >= 0.0;

        if (sphere_intersected)
        {
            float hit_distance = (-b - sqrt(d)) / (2.0 * a);

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

vec3 trace(vec3 pos, vec3 dir, inout uint seed)
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

            vec3 diffuse_dir = normalize(ray.normal + direction_random(seed));
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

vec3 pixel_at(vec2 pixel, uint seed)
{
    vec3 shifted_camera_pos = camera_pos + vec3(direction_random(seed).xy * camera_blur, 1.0);

    vec2 shifted_pixel = pixel - 0.5;
    vec3 pixel_position =
        (shifted_pixel.x * camera_right_n) * camera_fov
        + (shifted_pixel.y * camera_up_n) * camera_fov
        - camera_forward_n * camera_focus;

    vec3 ray_direction = normalize(pixel_position - shifted_camera_pos);

    return trace(shifted_camera_pos, ray_direction, seed);
}

void main()
{
    vec2 pixel = gl_FragCoord.xy / vec2(CANVAS_DIMENSIONS);
    uint seed = uint(gl_FragCoord.y) * uint(CANVAS_DIMENSIONS.x) + uint(gl_FragCoord.x) + 1u;

    const uint RAYS_PER_PIXEL = 4u;

    vec3 color = vec3(0.0);
    for(uint i = 0u; i < RAYS_PER_PIXEL; ++i)
    {
        color += pixel_at(pixel, (seed + i * 568877u) * 5016083u + frame_seed);
    }

    frag_color = vec4(color / float(RAYS_PER_PIXEL), 1.0);
}