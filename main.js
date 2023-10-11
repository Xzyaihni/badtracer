const v_shader = `#version 300 es

in vec4 a_vertex_position;

void main()
{
    gl_Position = a_vertex_position;
}`;
const f_shader = `#version 300 es

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

uint squares_random(uint seed_raw, inout uint w, inout uint current)
{
    uint seed = seed_raw | 0x80000001u;

    w += seed;

    current = (current * current) + w;
    current = (current >> 16) | (current << 16);

    return current;
}

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
    uint pixel_index = uint(gl_FragCoord.y) * uint(CANVAS_DIMENSIONS.x) + uint(gl_FragCoord.x);
    uint seed = (pixel_index + 1u) * (pixel_index + 1u);

    const uint RAYS_PER_PIXEL = 32u;

    vec3 color = vec3(0.0);
    for(uint i = 0u; i < RAYS_PER_PIXEL; ++i)
    {
        uint seed_inner = squares_random(frame_seed, seed, i);
        color += pixel_at(pixel, seed_inner);
    }

    frag_color = vec4(color / float(RAYS_PER_PIXEL), 1.0);
}`;
const SPHERES_AMOUNT = 10; //COPY TO JS
const canvas = new OffscreenCanvas(640, 640);
const gl = canvas.getContext("webgl2");

const display_canvas = document.getElementById("display_canvas");
const display_context = display_canvas.getContext("2d");

let spheres_pos = [];
let spheres_size = [];
let spheres_color = [];
let spheres_luminance = [];
let spheres_smoothness = [];

let program_info = null;

let rendered_image = null;

let frame_index = 0;
const max_rays = 1000;

document.addEventListener("DOMContentLoaded", main);
function main()
{
    if (gl === null)
    {
        alert("nyo opengl im so sowy 😭");
        return;
    } else
    {
        initialize_scene();
    }
}

function mix_frame()
{
    const width = canvas.width;
    const height = canvas.height;

    const total_size = width * height * 4;

    let canvas_image = new Uint8ClampedArray(total_size);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, canvas_image);

    const display_image = display_context.getImageData(0, 0, width, height).data;

    if (rendered_image === null)
    {
        rendered_image = new Float64Array(total_size);

        for(let i = 0; i < total_size; ++i)
        {
            const this_pixel = display_image[i];

            rendered_image[i] = this_pixel;

            canvas_image[i] = this_pixel;
        }
    } else
    {
        const next_frame = frame_index + 1;
        for(let i = 0; i < total_size; ++i)
        {
            const mixed_pixel =
                rendered_image[i] * (frame_index / next_frame) + canvas_image[i] / next_frame;

            rendered_image[i] = mixed_pixel;

            canvas_image[i] = mixed_pixel;
        }
    }

    const canvas_data = new ImageData(canvas_image, width, height);
    display_context.putImageData(canvas_data, 0, 0);
}

function bind_per_frame_uniforms()
{
    gl.uniform1ui(program_info.uniform_locations.frame_seed, Math.random() * 4294967295);
}

function draw_frame()
{
    bind_per_frame_uniforms();

    //draw the rectangle with everything on it
    //0 offset 4 vertices
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    mix_frame();

    frame_index += 1;

    if (frame_index < max_rays)
    {
        requestAnimationFrame(draw_frame);
    }
}

function random_sphere()
{
    const size = Math.random() * 0.15 + 0.05;

    const possible_colors = [{r: 140, g: 235, b: 255}, {r: 255, g: 109, b: 201}];
    const index = Math.floor(Math.random() * 2.0);

    const this_color = possible_colors[index];

    return {
        position: {
            x: (Math.random() - 0.5) * 1.5,
            y: size + (Math.random() - 0.2) * 0.09,
            z: -Math.random() * 0.7 + 0.2
        },
        size: size,
        color: {
            r: Math.random(),
            g: Math.random(),
            b: Math.random()
        },
        // color: this_color,
        luminance: 0.0,
        smoothness: 0.05 + Math.random() * 0.9
    };
}

function initialize_spheres(amount)
{
    const spheres = [
        {
            position: {
                x: 0.0,
                y: -1000.0,
                z: 0.0
            },
            size: 1000.0,
            color: {
                r: 1.0,
                g: 1.0,
                b: 1.0
            },
            luminance: 0.0,
            smoothness: 0.0
        }
    ];

    const lights_amount = Math.ceil(Math.random() * 2.0);

    const random_amount = amount - spheres.length;
    for(let i = 0; i < random_amount; ++i)
    {
        let sphere = random_sphere();

        if (i < lights_amount)
        {
            //this one glows
            const c_color = sphere.color;
            const smallest_color = Math.min(Math.min(c_color.r, c_color.g), c_color.b);

            const max_factor = 1.0 / smallest_color;

            sphere.color = {
                r: sphere.color.r * max_factor,
                g: sphere.color.g * max_factor,
                b: sphere.color.b * max_factor
            };
            sphere.luminance = Math.random() * 20.0 + 10.0;
        }

        spheres.push(sphere);
    }

    for(let i = 0; i < spheres.length; ++i)
    {
        let sphere = spheres[i];

        spheres_pos.push(sphere.position.x);
        spheres_pos.push(sphere.position.y);
        spheres_pos.push(sphere.position.z);

        spheres_size.push(sphere.size);

        spheres_color.push(sphere.color.r);
        spheres_color.push(sphere.color.g);
        spheres_color.push(sphere.color.b);

        spheres_luminance.push(sphere.luminance);

        spheres_smoothness.push(sphere.smoothness);
    }
}

function bind_uniforms()
{
    if (program_info === null)
    {
        return null;
    }

    gl.uniform3fv(program_info.uniform_locations.spheres_pos, spheres_pos);
    gl.uniform1fv(program_info.uniform_locations.spheres_size, spheres_size);
    gl.uniform3fv(program_info.uniform_locations.spheres_color, spheres_color);
    gl.uniform1fv(program_info.uniform_locations.spheres_luminance, spheres_luminance);
    gl.uniform1fv(program_info.uniform_locations.spheres_smoothness, spheres_smoothness);
}

function initialize_scene()
{
    program_info = attributes_info();
    if (program_info === null)
    {
        return;
    }

    const buffer = init_default_buffer(program_info);

    gl.useProgram(program_info.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

    //default but still
    gl.frontFace(gl.CCW);

    initialize_spheres(SPHERES_AMOUNT);

    if (bind_uniforms() === null)
    {
        alert("error when binding uniforms");

        return;
    }

    requestAnimationFrame(draw_frame);
}

function init_default_buffer(program_info)
{
    const position_buffer = gl.createBuffer();

    gl.bindBuffer(gl.ARRAY_BUFFER, position_buffer);

    const positions = [-1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0];

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    gl.vertexAttribPointer(
        program_info.attribute_locations.vertex_position,
        2, //positions per vertex
        gl.FLOAT,
        false, //no normalization
        0, //calculate stride automatically
        0 //no offset
    );

    gl.enableVertexAttribArray(program_info.attribute_locations.vertex_position);

    return position_buffer;
}

function attributes_info()
{
    const shader_program = load_program();
    if (shader_program === null)
    {
        return null;
    }

    const get_attrib = name => gl.getAttribLocation(shader_program, name);

    const program_info =
    {
        program: shader_program,
        attribute_locations:
        {
            vertex_position: get_attrib("a_vertex_position")
        },
        uniform_locations: {}
    };

    const add_uniform = name =>
    {
        program_info.uniform_locations[name] = gl.getUniformLocation(shader_program, name);
    };

    add_uniform("spheres_pos");
    add_uniform("spheres_size");
    add_uniform("spheres_color");
    add_uniform("spheres_luminance");
    add_uniform("spheres_smoothness");

    add_uniform("frame_seed");

    return program_info;
}

function load_program()
{
    const vertex_shader = load_shader(v_shader, gl.VERTEX_SHADER);
    const fragment_shader = load_shader(f_shader, gl.FRAGMENT_SHADER);

    if (vertex_shader === null || fragment_shader === null)
    {
        return null;
    }

    const shader_program = gl.createProgram();
    gl.attachShader(shader_program, vertex_shader);
    gl.attachShader(shader_program, fragment_shader);
    gl.linkProgram(shader_program);

    if (!gl.getProgramParameter(shader_program, gl.LINK_STATUS))
    {
        const program_log = gl.getProgramInfoLog(shader_program);
        alert(`error linking shader program 😭: ${program_log}`);

        return null;
    } else
    {
        return shader_program;
    }
}

function load_shader(source, type)
{
    const shader = gl.createShader(type);

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
    {
        let type_stringified = "unknown";
        if (type === gl.VERTEX_SHADER)
        {
            type_stringified = "vertex";
        } else if (type === gl.FRAGMENT_SHADER)
        {
            type_stringified = "fragment";
        }

        const shader_log = gl.getShaderInfoLog(shader);
        alert(`error compiling shader 😭 (${type_stringified} type): ${shader_log}`);

        gl.deleteShader(shader);
        return null;
    } else
    {
        return shader;
    }
}
