const v_shader = `#version 300 es

in vec4 a_vertex_position;

void main()
{
    gl_Position = a_vertex_position;
}`;
const f_shader = `#version 300 es

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
uniform vec3 spheres_emissive_color[SPHERES_AMOUNT];
uniform float spheres_smoothness[SPHERES_AMOUNT];
uniform float spheres_surface_thickness[SPHERES_AMOUNT];

uniform vec3 camera_pos;
uniform vec3 camera_forward_n;
uniform vec3 camera_right_n;
uniform vec3 camera_up_n;
uniform float camera_focus;

uniform uint frame_seed[5];

uniform vec3 topmax_background_color;
uniform vec3 topmin_background_color;
uniform vec3 sky_color;

const float CAMERA_BLUR = 0.005;

const float SKY_LIGHT_SIZE = 0.2;

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

float offset_random(inout XorwowState state)
{
    return uniform_random(state) * 2.0 - 1.0;
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
    float a = dir.y * 3.0;

    vec3 background = mix(topmin_background_color, topmax_background_color, clamp(a, 0.0, 1.0));

    float light_amount = (distance(dir, vec3(0.37139, 0.742781, 0.55708)) - SKY_LIGHT_SIZE) * 10.0;

    return mix(sky_color, background, clamp(light_amount, 0.0, 1.0));
}

struct RayInfo
{
    bool intersected;
    vec3 color;
    vec3 point;
    vec3 normal;
    vec3 emissive_color;
    float smoothness;
    float surface_thickness;
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
                ray.emissive_color = spheres_emissive_color[i];
                ray.smoothness = spheres_smoothness[i];
		ray.surface_thickness = spheres_surface_thickness[i];
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
            vec3 diffuse_dir = normalize(ray.normal + direction_random(state));
            vec3 specular_dir = reflect(dir, ray.normal);

	    float surface_reflected = float(uniform_random(state) < ray.surface_thickness);

            dir = mix(diffuse_dir, specular_dir, ray.smoothness * surface_reflected);
	    pos = ray.point;

            illuminated_color += ray.emissive_color * total_color;
            total_color *= mix(ray.color, vec3(1.0), surface_reflected);
        } else
        {
            illuminated_color += background_color(dir) * total_color;
            break;
        }
    }

    return illuminated_color;
}

vec3 pixel_at(vec2 pixel, inout XorwowState state)
{
    vec3 shift = vec3(CAMERA_BLUR);
    shift.x *= offset_random(state);
    shift.y *= offset_random(state);
    shift.z *= offset_random(state);

    vec3 origin = camera_pos + shift;

    vec2 center_offset = pixel - 0.5;

    vec3 target = camera_pos
      + center_offset.x * camera_right_n * camera_focus
      + center_offset.y * camera_up_n * camera_focus
      + camera_forward_n * camera_focus * 0.5;

    vec3 direction = normalize(target - origin);

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

    vec3 current_color = color / float(RAYS_PER_PIXEL);

    float gamma = 2.2;
    vec3 mapped_color = pow(current_color / (current_color + vec3(1.0)), vec3(1.0 / gamma));

    frag_color = vec4(mapped_color, 1.0);
}`;
const SPHERES_AMOUNT = 10; //COPY TO JS
const canvas = new OffscreenCanvas(640, 640);
const gl = canvas.getContext("webgl2");

const display_canvas = document.getElementById("display_canvas");
const display_context = display_canvas.getContext("2d");

const frame_counter_element = document.getElementById("frame_counter");

const mouse_sensitivity_element = document.getElementById("mouse_sensitivity");
const camera_focus_element = document.getElementById("focus_slider");

const day_checkbox = document.getElementById("day_checkbox");

let is_daytime = false;

let spheres_pos = [];
let spheres_size = [];
let spheres_color = [];
let spheres_emissive_color = [];
let spheres_smoothness = [];
let spheres_surface_thickness = [];

let camera_pos = [0.0, 0.5, -0.4];
let camera_yaw = 0.0;
let camera_pitch = 0.0;
let camera_focus = 0.0;

let mouse_x_this_frame = 0.0;
let mouse_y_this_frame = 0.0;

let mouse_sensitivity = 0.0;
let is_mouse_locked = false;

let program_info = null;

// use kahan sum to sum up all frames
let rendered_image = null;
let rendered_image_comp = null;

let previous_frame_time = 0.0;

let frame_index = 0;
let max_rays = 100;

let keys_pressed = {
    forward: false,
    back: false,
    left: false,
    right: false,
    up: false,
    down: false
};

display_canvas.addEventListener("click", async () => lock_pointer(display_canvas));

on_mouse_sensitivity(mouse_sensitivity_element);
mouse_sensitivity_element.addEventListener("input", (e) => on_mouse_sensitivity(e.target));

on_camera_focus(camera_focus_element);
camera_focus_element.addEventListener("input", (e) => on_camera_focus(e.target));

day_checkbox.addEventListener("change", (e) => set_daytime(e.target.checked));

document.addEventListener("pointerlockchange", (e) => { is_mouse_locked = document.pointerLockElement != null; });

document.addEventListener("DOMContentLoaded", main);

document.addEventListener("keydown", on_key_down);
document.addEventListener("keyup", on_key_up);
document.addEventListener("mousemove", on_mouse_move)

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

function increase_max()
{
    const previous = max_rays;
    max_rays = max_rays * 2;

    const change = previous / max_rays;

    rendered_image = rendered_image.map((x) => x * change);
    rendered_image_comp = rendered_image_comp.map((x) => x * change);
}

function mix_frame()
{
    const width = canvas.width;
    const height = canvas.height;

    const total_size = width * height * 4;

    let canvas_image = new Uint8ClampedArray(total_size);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, canvas_image);

    if (rendered_image === null)
    {
	rendered_image = [];
	rendered_image_comp = [];

        for(let i = 0; i < total_size; ++i)
        {
            rendered_image[i] = canvas_image[i] / max_rays;
	    rendered_image_comp[i] = 0.0;
        }
    } else
    {
	const to_max_ratio = max_rays / frame_index;
        for(let i = 0; i < total_size; ++i)
        {
	    const current_pixel = canvas_image[i] / max_rays;

	    const y = current_pixel - rendered_image_comp[i];
	    const t = rendered_image[i] + y;

	    rendered_image_comp[i] = (t - rendered_image[i]) - y;
            rendered_image[i] = t;

            canvas_image[i] = rendered_image[i] * to_max_ratio;
        }
    }

    const canvas_data = new ImageData(canvas_image, width, height);
    display_context.putImageData(canvas_data, 0, 0);
}

function bind_per_frame_uniforms()
{
    const new_random = () => { return Math.floor(Math.random() * 4294967295); };
    const seeds = [new_random(), new_random(), new_random(), new_random(), new_random()];

    gl.uniform1uiv(program_info.uniform_locations.frame_seed, seeds);
}

function clear_rendered()
{
    rendered_image = null;
    frame_index = 0;
}

function array_add(a, b)
{
    return a.map((x, i) => x + b[i]);
}

function array_sub(a, b)
{
    return a.map((x, i) => x - b[i]);
}

function array_mul(a, s)
{
    return a.map((x) => x * s);
}

function array_div(a, s)
{
    return a.map((x) => x / s);
}

function array_negate(a)
{
    return a.map((x) => -x);
}

function cross_2d(a, b)
{
    return a[0] * b[1] - b[0] * a[1];
}

function cross_3d(a, b)
{
    return [
	cross_2d([a[1], a[2]], [b[1], b[2]]),
	cross_2d([a[2], a[0]], [b[2], b[0]]),
	cross_2d([a[0], a[1]], [b[0], b[1]])
    ];
}

function magnitude(a)
{
    return Math.sqrt(a.map((x) => x * x).reduce((acc, x) => acc + x, 0));
}

function normalize(a)
{
    return array_div(a, magnitude(a));
}

function is_normalized(a)
{
    return Math.abs(magnitude(a) - 1.0) < 0.001;
}

function create_basis(forward, other)
{
    if (!is_normalized(forward))
    {
	alert("forward vector (" + forward + ") isnt normalized in create_basis, fix that!");
    }

    if (!is_normalized(other))
    {
	alert("second vector (" + other + ") isnt normalized in create_basis!!! bad!!");
    }

    const right_un = cross_3d(other, forward);

    if (magnitude(right_un) <= 0.0)
    {
	alert("forward and second vectors in create_basis must not be parallel, ITS OVER");
    }

    const right = normalize(right_un);
    const up = normalize(cross_3d(forward, right));

    return {
	forward,
	right,
	up
    }
}

function camera_forward(yaw, pitch)
{
    return [
	Math.sin(yaw) * Math.cos(pitch),
	-Math.sin(pitch),
	Math.cos(yaw) * Math.cos(pitch)
    ];
}

function current_camera()
{
    return {
	position: camera_pos,
	focus: camera_focus,
	basis: create_basis(camera_forward(camera_yaw, camera_pitch), [0.0, 1.0, 0.0])
    }
}

function camera_changed()
{
    bind_camera_uniforms(current_camera());
    clear_rendered();
}

function current_sky()
{
    if (is_daytime)
    {
	const back_light = 1.0;

	return {
	    top: array_mul([0.198, 0.714, 0.954], back_light * 0.95),
	    bottom: array_mul([0.732, 0.915, 1.0], back_light),
	    color: array_mul([1.0, 1.0, 1.0], 15.0)
	}
    } else
    {
	const back_light = 0.001;
	return {
	    top: array_mul([0.115, 0.144, 0.272], back_light),
	    bottom: array_mul([0.209, 0.234, 0.346], back_light),
	    color: array_mul([0.5, 0.6, 1.0], 0.05)
	}
    }
}

function set_daytime(new_state)
{
    if (is_daytime === new_state)
    {
	return;
    }

    is_daytime = new_state;

    bind_sky_uniforms(current_sky());
    clear_rendered();
}

function get_key_changer(e)
{
    switch (e.code)
    {
        case "KeyW":
	  return (x) => { keys_pressed.forward = x };

        case "KeyS":
	  return (x) => { keys_pressed.back = x };

        case "KeyA":
	  return (x) => { keys_pressed.left = x };

        case "KeyD":
	  return (x) => { keys_pressed.right = x };

	case "Space":
	  return (x) => { keys_pressed.up = x };

	case "KeyC":
	  return (x) => { keys_pressed.down = x };

	default:
	  return (_) => {};
    }
}

async function lock_pointer(target)
{
    await target.requestPointerLock({ unadjustedMovement: true });
}

function on_mouse_sensitivity(e)
{
    mouse_sensitivity = e.value * e.value;
}

function on_camera_focus(e)
{
    camera_focus = e.value;
    camera_changed();
}

function on_mouse_move(e)
{
    mouse_x_this_frame += e.movementX;
    mouse_y_this_frame += e.movementY;
}

function handle_mouse_inputs(dt)
{
    if (!is_mouse_locked)
    {
	return;
    }

    if (mouse_x_this_frame === 0.0 && mouse_y_this_frame === 0.0)
    {
	return;
    }

    const clamp = (x, low, high) => Math.max(low, Math.min(x, high));

    camera_yaw += mouse_x_this_frame * mouse_sensitivity;
    camera_pitch += mouse_y_this_frame * mouse_sensitivity;

    const limit = Math.PI / 2.0;
    camera_pitch = clamp(camera_pitch, -limit, limit);

    mouse_x_this_frame = 0.0;
    mouse_y_this_frame = 0.0;

    camera_changed();
}

function on_key_down(e)
{
    get_key_changer(e)(true);
}

function on_key_up(e)
{
    get_key_changer(e)(false);
}

function movement_directions()
{
    const camera = current_camera().basis;

    const directions = [];

    if (keys_pressed.forward)
    {
	directions.push(camera.forward);
    }

    if (keys_pressed.back)
    {
	directions.push(array_negate(camera.forward));
    }

    if (keys_pressed.left)
    {
	directions.push(array_negate(camera.right));
    }

    if (keys_pressed.right)
    {
	directions.push(camera.right);
    }

    if (keys_pressed.up)
    {
	directions.push([0.0, 1.0, 0.0]);
    }

    if (keys_pressed.down)
    {
	directions.push([0.0, -1.0, 0.0]);
    }

    return directions;
}

function handle_movement_inputs(dt)
{
    const directions = movement_directions(dt);

    if (directions.length === 0)
    {
	return;
    }

    const speed = 0.02 * dt;

    directions.forEach((direction) => { camera_pos = array_add(camera_pos, array_mul(direction, speed)); });

    camera_changed();
}

function handle_inputs(dt)
{
    handle_movement_inputs(dt);
    handle_mouse_inputs(dt);
}

function draw_frame(current_time)
{
    const dt = Math.min(current_time - previous_frame_time, 0.5);
    previous_frame_time = current_time;

    handle_inputs(dt);

    if (frame_index < max_rays)
    {
	bind_per_frame_uniforms();

	//draw the rectangle with everything on it
	//0 offset 4 vertices
	gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

	mix_frame();

	frame_index += 1;

	const progress = (frame_index / max_rays) * 100.0;
	frame_counter_element.innerHTML = "progress: " + progress.toFixed(1) + "%";
    }

    requestAnimationFrame(draw_frame);
}

function recreate_scene()
{
    initialize_spheres(SPHERES_AMOUNT);
    bind_uniforms();
    clear_rendered();
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
            z: Math.random() * 0.7 + 0.2
        },
        size: size,
        color: {
            r: Math.random(),
            g: Math.random(),
            b: Math.random()
        },
	emissive_color: {
	    r: 0.0,
	    g: 0.0,
	    b: 0.0
	},
        smoothness: 0.05 + Math.random() * 0.9,
	surface_thickness: Math.random()
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
            emissive_color: {
                r: 0.0,
                g: 0.0,
                b: 0.0
            },
            smoothness: 0.02,
	    surface_thickness: 0.5
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
	    const scale = Math.random() * 1.0 + 0.2;
            sphere.emissive_color = {
                r: sphere.color.r * scale,
                g: sphere.color.g * scale,
                b: sphere.color.b * scale
            };

	    sphere.color = {
		r: 0.0,
		g: 0.0,
		b: 0.0
	    };
        }

        spheres.push(sphere);
    }

    for(let i = 0; i < spheres.length; ++i)
    {
        let sphere = spheres[i];

        spheres_pos[i * 3] = sphere.position.x;
        spheres_pos[i * 3 + 1] = sphere.position.y;
        spheres_pos[i * 3 + 2] = sphere.position.z;

        spheres_size[i] = sphere.size;

        spheres_color[i * 3] = sphere.color.r;
        spheres_color[i * 3 + 1] = sphere.color.g;
        spheres_color[i * 3 + 2] = sphere.color.b;

        spheres_emissive_color[i * 3] = sphere.emissive_color.r;
        spheres_emissive_color[i * 3 + 1] = sphere.emissive_color.g;
        spheres_emissive_color[i * 3 + 2] = sphere.emissive_color.b;

        spheres_smoothness[i] = sphere.smoothness;
        spheres_surface_thickness[i] = sphere.surface_thickness;
    }
}

function bind_camera_uniforms(camera)
{
    if (program_info === null)
    {
	return null;
    }

    gl.uniform3fv(program_info.uniform_locations.camera_pos, camera.position);

    gl.uniform3fv(program_info.uniform_locations.camera_forward_n, camera.basis.forward);
    gl.uniform3fv(program_info.uniform_locations.camera_right_n, camera.basis.right);
    gl.uniform3fv(program_info.uniform_locations.camera_up_n, camera.basis.up);

    gl.uniform1f(program_info.uniform_locations.camera_focus, camera.focus);
}

function bind_sky_uniforms(sky)
{
    gl.uniform3fv(program_info.uniform_locations.topmax_background_color, sky.top);
    gl.uniform3fv(program_info.uniform_locations.topmin_background_color, sky.bottom);
    gl.uniform3fv(program_info.uniform_locations.sky_color, sky.color);
}

function bind_sphere_uniforms()
{
    gl.uniform3fv(program_info.uniform_locations.spheres_pos, spheres_pos);
    gl.uniform1fv(program_info.uniform_locations.spheres_size, spheres_size);
    gl.uniform3fv(program_info.uniform_locations.spheres_color, spheres_color);
    gl.uniform3fv(program_info.uniform_locations.spheres_emissive_color, spheres_emissive_color);
    gl.uniform1fv(program_info.uniform_locations.spheres_smoothness, spheres_smoothness);
    gl.uniform1fv(program_info.uniform_locations.spheres_surface_thickness, spheres_surface_thickness);
}

function bind_uniforms()
{
    if (program_info === null)
    {
        return null;
    }

    bind_sphere_uniforms();
    bind_camera_uniforms(current_camera());
    bind_sky_uniforms(current_sky());
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
    add_uniform("spheres_emissive_color");
    add_uniform("spheres_smoothness");
    add_uniform("spheres_surface_thickness");

    add_uniform("camera_pos");
    add_uniform("camera_forward_n");
    add_uniform("camera_right_n");
    add_uniform("camera_up_n");
    add_uniform("camera_focus");

    add_uniform("frame_seed");

    add_uniform("topmax_background_color");
    add_uniform("topmin_background_color");
    add_uniform("sky_color");
    add_uniform("background_luminance");

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
